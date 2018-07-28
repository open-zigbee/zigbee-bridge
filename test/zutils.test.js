const expect = require('chai').expect;
const zutils = require('../lib/components/zutils');

describe('ZUtils Tests', function() {
    describe('#.parseClusterAttr', function() {
        it('should throw TypeError if input attribute is string and cluster id is undefined', function () {
            expect(() => zutils.parseClusterAttr(undefined, 'manufacturerName')).to.throw(TypeError);
        });

        it('should throw TypeError if input attribute is string and does not exist in cluster library', function () {
            expect(() => zutils.parseClusterAttr('genPowerCfg', 'wrongAttribute')).to.throw(TypeError);
        });

        it('should throw TypeError if input cluster id does not exist in cluster library', function () {
            expect(() => zutils.parseClusterAttr('wrongCluster', 'mainsVoltage')).to.throw(TypeError);
        });

        it('should throw TypeError if input attribute id is undefined', function () {
            expect(() => zutils.parseClusterAttr('genIdentify')).to.throw(TypeError);
        });

        it('should parse attribute id as an argument', function() {
            expect(zutils.parseClusterAttr('genBasic', 'powerSource')).to.eql({
                id: 7,
                type: 48,
            });
        });

        it('should parse attribute definition as an argument', function() {
            expect(zutils.parseClusterAttr('genBasic', { id: 65281, type: 'charStr' })).to.eql({
                id: 65281,
                type: 66,
            });
        });
    });
});