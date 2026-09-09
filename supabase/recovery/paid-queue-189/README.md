# Paid queue 189 recovery

`rollback.sql` removes only the queue classification by returning the 189 queued rows to protected history. It does not delete rows, change the active Free 200 or open any runtime access.
