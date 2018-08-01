const Endpoint = require('./endpoint');

module.exports = class Coordpoint extends Endpoint {
    constructor(coord, simpleDesc, isDelegator) {
        super(coord, simpleDesc);

        // this is a local endpoint, always return true
        this.isLocal = () => true;

        // this local endpoint maybe a delegator
        this.isDelegator = () => !!(isDelegator || false);
    }
};