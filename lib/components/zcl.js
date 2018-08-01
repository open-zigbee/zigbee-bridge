const zclPacket = require('zigbee-bridge-packet');

module.exports = {

    frame: zclPacket.frame,
    parse: zclPacket.parse,

    header(rawBuf) {
        const header = zclPacket.header(rawBuf);

        if (!header) return;

        // 2, 3 are reserved
        if (header.frameCntl.frameType > 1) return;

        return header;
    },
};