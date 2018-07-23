const _ = require('busyman');
const Device = require('./device');

module.exports = class Coordinator extends Device {

    constructor(devInfo) {
        super(devInfo);

        this.status = 'online';
    }

    getDelegator(profId) {
        return _.find(this.endpoints, function (ep) {
            return ep.isDelegator() && (ep.getProfId() === profId);
        });
    }

};