var onReadAsDataURL = function(event, text, filename, pcs, part) {
    var data = {}; // data object to transmit over data channel

    if (event) { // on first invocation
        part = 0;
        text = event.target.result;
        data.filesize = text.length;
        data.filename = filename;
    }

    if (text.length > file.chunkLength) {
        data.message = text.slice(0, file.chunkLength);
    } else { // on last invocation
        data.message = text;
        data.last = true;
    }

    data.part = part;

    pcs.map(function(pc) {
        if (pc.conn.channel.readyState === 'open') {
            try {
                pc.conn.channel.send(JSON.stringify({
                    data: data,
                    type: 'file'
                }));
            } catch (error) {
                console.log('couldn\'t send file: ', error);
            }
        } else {
            console.log('couldn\'t send file to this unopen channel: ', pc.conn.channel);
        }
    });

    var remainingDataURL = text.slice(data.message.length);
    if (remainingDataURL.length) setTimeout(function () {
        onReadAsDataURL(null, remainingDataURL, undefined, pcs, part + 1); // continue transmitting
    }, 0);
};

var saveToDisk = function(fileUrl, fileName) {
    var save = document.createElement('a');
    save.href = fileUrl;
    save.target = '_blank';
    save.download = fileName || fileUrl;

    var event = document.createEvent('Event');
    event.initEvent('click', true, true);

    save.dispatchEvent(event);
    (window.URL || window.webkitURL).revokeObjectURL(save.href);
};