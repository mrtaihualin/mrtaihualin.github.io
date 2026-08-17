-- Phase 1 P1-F-08 / P1-G-01 / P1-G-07 reliability snapshot.
-- READ-ONLY ONLY: produces aggregate operational evidence and never returns
-- notification bodies, student identifiers, secret values or cron commands.
-- A 2xx is transport evidence. It becomes a no-internal-error outcome only
-- after the matching guarded Edge source is deployed; it never proves that a
-- downstream recipient saw a notification.

-- [A] Wrapper security and least privilege.
select p.proname as wrapper,
       position('x-cron-secret' in pg_get_functiondef(p.oid)) > 0 as sends_internal_header,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'private'
  and p.proname in (
    'call_class_reminder_cron',
    'call_request_sla_cron',
    'call_low_quota_cron'
  )
order by p.proname;

-- [B] Active schedules without printing their commands or credentials.
select jobname,
       schedule,
       active,
       command !~ 'Bearer|apikey|eyJ' as command_is_clean
from cron.job
where jobname in (
  'class-reminder-every-5-min',
  'request-sla-reminder',
  'low-quota-daily'
)
order by jobname;

-- [C] Durable missed-run/HTTP state with explicit response-retention handling.
with expected(job_name, max_age) as (
  values
    ('class-reminder-every-5-min'::text, interval '10 minutes'),
    ('request-sla-reminder'::text, interval '10 hours'),
    ('low-quota-daily'::text, interval '30 hours')
),
latest as (
  select distinct on (l.job_name)
         l.job_name,
         l.called_at,
         r.status_code
  from private.cron_http_log l
  left join net._http_response r on r.id = l.request_id
  join expected e on e.job_name = l.job_name
  order by l.job_name, l.called_at desc
)
select e.job_name,
       l.called_at as last_called_at,
       round(extract(epoch from (now() - l.called_at)) / 60.0, 1) as age_minutes,
       l.status_code,
       case
         when l.called_at is null or now() - l.called_at > e.max_age then 'MISSED_SCHEDULE'
         when l.status_code is null then 'RESPONSE_UNAVAILABLE'
         when l.status_code between 200 and 299 then 'HTTP_2XX_TRANSPORT_ONLY'
         else 'HTTP_FAILURE'
       end as readiness_state
from expected e
left join latest l on l.job_name = e.job_name
order by e.job_name;

-- [D] Last 24-hour aggregate. response_unavailable can rise because pg_net
-- response rows have shorter retention than private.cron_http_log; do not
-- reinterpret that as success or failure without current Edge invocation logs.
select l.job_name,
       count(*) as attempts,
       count(*) filter (where r.status_code between 200 and 299) as http_2xx,
       count(*) filter (
         where r.status_code is not null and r.status_code not between 200 and 299
       ) as http_non_2xx,
       count(*) filter (where r.status_code is null) as response_unavailable,
       max(l.called_at) as last_called_at
from private.cron_http_log l
left join net._http_response r on r.id = l.request_id
where l.job_name in (
  'class-reminder-every-5-min',
  'request-sla-reminder',
  'low-quota-daily'
)
  and l.called_at >= now() - interval '24 hours'
group by l.job_name
order by l.job_name;
