// ============================================================
// fix-webm-duration v1.0.6 (MIT, Yan Senotrusov) — 內嵌版
// 來源 https://github.com/yusitnikov/fix-webm-duration
// 作用：webm 錄影檔常常沒寫入「時長」→ 播放器/Google Drive 顯示 00:00 且不能拖動。
//       我們已知道實際秒數（計時器），用這支把時長補回檔頭，存下來/上雲端就能正常播放與拖動。
// ============================================================
(function (name, definition) {
    if (typeof define === 'function' && define.amd) { define(definition); }
    else if (typeof module !== 'undefined' && module.exports) { module.exports = definition(); }
    else { window.ysFixWebmDuration = definition(); }
})('fix-webm-duration', function () {
    var sections = {
        0xa45dfa3: { name: 'EBML', type: 'Container' },
        0x286: { name: 'EBMLVersion', type: 'Uint' },
        0x2f7: { name: 'EBMLReadVersion', type: 'Uint' },
        0x2f2: { name: 'EBMLMaxIDLength', type: 'Uint' },
        0x2f3: { name: 'EBMLMaxSizeLength', type: 'Uint' },
        0x282: { name: 'DocType', type: 'String' },
        0x287: { name: 'DocTypeVersion', type: 'Uint' },
        0x285: { name: 'DocTypeReadVersion', type: 'Uint' },
        0x6c: { name: 'Void', type: 'Binary' },
        0x3f: { name: 'CRC-32', type: 'Binary' },
        0x8538067: { name: 'Segment', type: 'Container' },
        0x14d9b74: { name: 'SeekHead', type: 'Container' },
        0xdbb: { name: 'Seek', type: 'Container' },
        0x13ab: { name: 'SeekID', type: 'Binary' },
        0x13ac: { name: 'SeekPosition', type: 'Uint' },
        0x549a966: { name: 'Info', type: 'Container' },
        0x33a4: { name: 'SegmentUID', type: 'Binary' },
        0x3384: { name: 'SegmentFilename', type: 'String' },
        0xad7b1: { name: 'TimecodeScale', type: 'Uint' },
        0x489: { name: 'Duration', type: 'Float' },
        0x461: { name: 'DateUTC', type: 'Date' },
        0x3ba9: { name: 'Title', type: 'String' },
        0xd80: { name: 'MuxingApp', type: 'String' },
        0x1741: { name: 'WritingApp', type: 'String' },
        0x654ae6b: { name: 'Tracks', type: 'Container' },
        0x2e: { name: 'TrackEntry', type: 'Container' },
        0x60: { name: 'Video', type: 'Container' },
        0x61: { name: 'Audio', type: 'Container' }
    };

    function doInherit(newClass, baseClass) {
        newClass.prototype = Object.create(baseClass.prototype);
        newClass.prototype.constructor = newClass;
    }
    function WebmBase(name, type) { this.name = name || 'Unknown'; this.type = type || 'Unknown'; }
    WebmBase.prototype.updateBySource = function() { };
    WebmBase.prototype.setSource = function(source) { this.source = source; this.updateBySource(); };
    WebmBase.prototype.updateByData = function() { };
    WebmBase.prototype.setData = function(data) { this.data = data; this.updateByData(); };

    function WebmUint(name, type) { WebmBase.call(this, name, type || 'Uint'); }
    doInherit(WebmUint, WebmBase);
    function padHex(hex) { return hex.length % 2 === 1 ? '0' + hex : hex; }
    WebmUint.prototype.updateBySource = function() {
        this.data = '';
        for (var i = 0; i < this.source.length; i++) { var hex = this.source[i].toString(16); this.data += padHex(hex); }
    };
    WebmUint.prototype.updateByData = function() {
        var length = this.data.length / 2;
        this.source = new Uint8Array(length);
        for (var i = 0; i < length; i++) { var hex = this.data.substr(i * 2, 2); this.source[i] = parseInt(hex, 16); }
    };
    WebmUint.prototype.getValue = function() { return parseInt(this.data, 16); };
    WebmUint.prototype.setValue = function(value) { this.setData(padHex(value.toString(16))); };

    function WebmFloat(name, type) { WebmBase.call(this, name, type || 'Float'); }
    doInherit(WebmFloat, WebmBase);
    WebmFloat.prototype.getFloatArrayType = function() { return this.source && this.source.length === 4 ? Float32Array : Float64Array; };
    WebmFloat.prototype.updateBySource = function() {
        var byteArray = this.source.reverse();
        var floatArrayType = this.getFloatArrayType();
        var floatArray = new floatArrayType(byteArray.buffer);
        this.data = floatArray[0];
    };
    WebmFloat.prototype.updateByData = function() {
        var floatArrayType = this.getFloatArrayType();
        var floatArray = new floatArrayType([ this.data ]);
        var byteArray = new Uint8Array(floatArray.buffer);
        this.source = byteArray.reverse();
    };
    WebmFloat.prototype.getValue = function() { return this.data; };
    WebmFloat.prototype.setValue = function(value) { this.setData(value); };

    function WebmContainer(name, type) { WebmBase.call(this, name, type || 'Container'); }
    doInherit(WebmContainer, WebmBase);
    WebmContainer.prototype.readByte = function() { return this.source[this.offset++]; };
    WebmContainer.prototype.readUint = function() {
        var firstByte = this.readByte();
        var bytes = 8 - firstByte.toString(2).length;
        var value = firstByte - (1 << (7 - bytes));
        for (var i = 0; i < bytes; i++) { value *= 256; value += this.readByte(); }
        return value;
    };
    WebmContainer.prototype.updateBySource = function() {
        this.data = [];
        for (this.offset = 0; this.offset < this.source.length; this.offset = end) {
            var id = this.readUint();
            var len = this.readUint();
            var end = Math.min(this.offset + len, this.source.length);
            var data = this.source.slice(this.offset, end);
            var info = sections[id] || { name: 'Unknown', type: 'Unknown' };
            var ctr = WebmBase;
            switch (info.type) {
                case 'Container': ctr = WebmContainer; break;
                case 'Uint': ctr = WebmUint; break;
                case 'Float': ctr = WebmFloat; break;
            }
            var section = new ctr(info.name, info.type);
            section.setSource(data);
            this.data.push({ id: id, idHex: id.toString(16), data: section });
        }
    };
    WebmContainer.prototype.writeUint = function(x, draft) {
        for (var bytes = 1, flag = 0x80; x >= flag && bytes < 8; bytes++, flag *= 0x80) { }
        if (!draft) {
            var value = flag + x;
            for (var i = bytes - 1; i >= 0; i--) { var c = value % 256; this.source[this.offset + i] = c; value = (value - c) / 256; }
        }
        this.offset += bytes;
    };
    WebmContainer.prototype.writeSections = function(draft) {
        this.offset = 0;
        for (var i = 0; i < this.data.length; i++) {
            var section = this.data[i], content = section.data.source, contentLength = content.length;
            this.writeUint(section.id, draft);
            this.writeUint(contentLength, draft);
            if (!draft) { this.source.set(content, this.offset); }
            this.offset += contentLength;
        }
        return this.offset;
    };
    WebmContainer.prototype.updateByData = function() {
        var length = this.writeSections('draft');
        this.source = new Uint8Array(length);
        this.writeSections();
    };
    WebmContainer.prototype.getSectionById = function(id) {
        for (var i = 0; i < this.data.length; i++) { var section = this.data[i]; if (section.id === id) { return section.data; } }
        return null;
    };

    function WebmFile(source) { WebmContainer.call(this, 'File', 'File'); this.setSource(source); }
    doInherit(WebmFile, WebmContainer);
    WebmFile.prototype.fixDuration = function(duration, options) {
        var logger = (options && options.logger) || function() { };
        var segmentSection = this.getSectionById(0x8538067);
        if (!segmentSection) { logger('[fix-webm-duration] Segment section is missing'); return false; }
        var infoSection = segmentSection.getSectionById(0x549a966);
        if (!infoSection) { logger('[fix-webm-duration] Info section is missing'); return false; }
        var timeScaleSection = infoSection.getSectionById(0xad7b1);
        if (!timeScaleSection) { logger('[fix-webm-duration] TimecodeScale section is missing'); return false; }
        var durationSection = infoSection.getSectionById(0x489);
        if (durationSection) {
            if (durationSection.getValue() <= 0) { durationSection.setValue(duration); }
            else { return false; }
        } else {
            durationSection = new WebmFloat('Duration', 'Float');
            durationSection.setValue(duration);
            infoSection.data.push({ id: 0x489, data: durationSection });
        }
        timeScaleSection.setValue(1000000);
        infoSection.updateByData();
        segmentSection.updateByData();
        this.updateByData();
        return true;
    };
    WebmFile.prototype.toBlob = function(mimeType) { return new Blob([ this.source.buffer ], { type: mimeType || 'video/webm' }); };

    function fixWebmDuration(blob, duration, callback, options) {
        if (typeof callback === "object") { options = callback; callback = undefined; }
        if (!callback) { return new Promise(function(resolve) { fixWebmDuration(blob, duration, resolve, options); }); }
        try {
            var reader = new FileReader();
            reader.onloadend = function() {
                try {
                    var file = new WebmFile(new Uint8Array(reader.result));
                    if (file.fixDuration(duration, options)) { blob = file.toBlob(blob.type); }
                } catch (ex) { }
                callback(blob);
            };
            reader.readAsArrayBuffer(blob);
        } catch (ex) { callback(blob); }
    }
    fixWebmDuration.default = fixWebmDuration;
    return fixWebmDuration;
});
