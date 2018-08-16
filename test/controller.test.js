const Q = require('q');
const sinon = require('sinon');
const expect = require('chai').expect;
const EventEmitter = require('events');
const Controller = require('../lib/controller');
const Device = require('../lib/model/device');
const Endpoint = require('../lib/model/endpoint');
const Coord = require('../lib/model/coord');
const Coordpoint = require('../lib/model/coordpoint');

let remoteDev = new Device({
    type: 1,
    ieeeAddr: '0x123456789abcdef',
    nwkAddr: 100,
    status: 2,
    joinTime: 1469528821,
    manufId: 10,
    epList: [1, 2],
    endpoints: {},
});

let rmEp1 = new Endpoint(remoteDev, {
    profId: 0x0104,
    epId: 1,
    devId: 0x0000,
    inClusterList: [0x0000, 0x0006],
    outClusterList: [0x0000],
});

let rmEp2 = new Endpoint(remoteDev, {
    profId: 0x0104,
    epId: 2,
    devId: 0x0002,
    inClusterList: [0x0000],
    outClusterList: [0x0000, 0x0006],
});

let coordDev = new Coord({
    type: 0,
    ieeeAddr: '0x0abcdef123456789',
    nwkAddr: 0,
    status: 2,
    joinTime: 1469528238,
    manufId: 10,
    epList: [1, 8],
    endpoints: {},
});

let loEp1 = new Coordpoint(coordDev, {
    profId: 0x0104,
    epId: 1,
    devId: 0x0002,
    inClusterList: [0x0000],
    outClusterList: [0x0000, 0x0006],
}, true);

let loEp8 = new Coordpoint(coordDev, {
    profId: 0x0104,
    epId: 8,
    devId: 0x0050,
    inClusterList: [0x0000],
    outClusterList: [0x0000, 0x0006],
});

describe('Constructor Check', function() {
    it('should has all correct members after new', function() {
        let controller = new Controller({}, {path: '/dev/ttyUSB0'});

        expect(controller._bridge).to.be.an('object');
        expect(controller._coord).to.be.null;
        expect(controller._znp).to.be.an('object');
        expect(controller._zdo).to.be.an('object');
        expect(controller._cfg).to.be.deep.equal({path: '/dev/ttyUSB0'});
        expect(controller._resetting).to.be.false;
        expect(controller.querie).to.be.an('object');

        expect(controller._net).to.be.deep.equal({
            state: null,
            channel: null,
            panId: null,
            extPanId: null,
            ieeeAddr: null,
            nwkAddr: null,
            joinTimeLeft: 0,
        });

        expect(controller.nextTransId).to.be.a('function');
        expect(controller.permitJoinCountdown).to.be.a('function');
        expect(controller.isResetting).to.be.a('function');
    });

    it('should throw if cfg is not an object', function() {
        expect(function() {
            return new Controller({}, 'x');
        }).to.throw(TypeError);
        expect(function() {
            return new Controller({}, 1);
        }).to.throw(TypeError);
        expect(function() {
            return new Controller({}, []);
        }).to.throw(TypeError);
        expect(function() {
            return new Controller({}, undefined);
        }).to.throw(TypeError);
        expect(function() {
            return new Controller({}, null);
        }).to.throw(TypeError);
        expect(function() {
            return new Controller({}, NaN);
        }).to.throw(TypeError);
        expect(function() {
            return new Controller({}, true);
        }).to.throw(TypeError);
        expect(function() {
            return new Controller({}, new Date());
        }).to.throw(TypeError);
        expect(function() {
            return new Controller({}, function() {});
        }).to.throw(TypeError);

        expect(function() {
            return new Controller({}, {});
        }).not.to.throw(TypeError);
    });
});

describe('Signature Check', function() {
    let controller = new Controller({}, {path: '/dev/ttyUSB0'});

    controller._coord = coordDev;

    describe('#.reset', () => {
        let requestStub;

        before(() => {
            requestStub = sinon.stub(controller, 'request', function(subsys, cmdId, valObj, callback) {
                let deferred = Q.defer();

                setImmediate(function() {
                    deferred.resolve({status: 0});
                });

                return deferred.promise.nodeify(callback);
            });
        });

        after(() => {
            requestStub.restore();
        });

        it('should be a function', () => {
            expect(controller.reset).to.be.a('function');
        });

        it('should throw if mode is not a number and not a string', () => {
            return Promise.all([
                controller.reset([])
                    .catch((err) => expect(err).to.be.instanceof(TypeError)),
                controller.reset({})
                    .catch((err) => expect(err).to.be.instanceof(TypeError)),
                controller.reset(undefined)
                    .catch((err) => expect(err).to.be.instanceof(TypeError)),
                controller.reset(null)
                    .catch((err) => expect(err).to.be.instanceof(TypeError)),
                controller.reset(NaN)
                    .catch((err) => expect(err).to.be.instanceof(TypeError)),
                controller.reset(true)
                    .catch((err) => expect(err).to.be.instanceof(TypeError)),
                controller.reset(new Date())
                    .catch((err) => expect(err).to.be.instanceof(TypeError)),
                controller.reset(function() {})
                    .catch((err) => expect(err).to.be.instanceof(TypeError)),

                controller.reset(1, function() {}),
                controller.reset('soft', function() {}),
            ]);
        });
    });

    describe('#.request', function() {
        it('should be a function', function() {
            expect(controller.request).to.be.a('function');
        });

        it('should throw if subsys is not a number and not a string', function() {
            expect(function() {
                return controller.request([], 'ping', {}, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.request({}, 'ping', {}, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.request(undefined, 'ping', {}, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.request(null, 'ping', {}, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.request(NaN, 'ping', {}, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.request(true, 'ping', {}, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.request(new Date(), 'ping', {}, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.request(function() {}, 'ping', {}, function() {});
            }).to.throw(TypeError);

            expect(function() {
                return controller.request(5, 'ping', {}, function() {});
            }).not.to.throw(TypeError);
            expect(function() {
                return controller.request('ZDO', 'ping', {}, function() {});
            }).not.to.throw(TypeError);
        });

        it('should throw if cmdId is not a number and not a string', function() {
            expect(function() {
                return controller.request('ZDO', [], {}, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.request('ZDO', {}, {}, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.request('ZDO', undefined, {}, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.request('ZDO', null, {}, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.request('ZDO', NaN, {}, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.request('ZDO', true, {}, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.request('ZDO', new Date(), {}, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.request('ZDO', function() {}, {}, function() {});
            }).to.throw(TypeError);

            expect(function() {
                return controller.request('ZDO', 10, {}, function() {});
            }).not.to.throw(TypeError);
            expect(function() {
                return controller.request('ZDO', 'ping', {}, function() {});
            }).not.to.throw(TypeError);
        });

        it('should throw if valObj is not an object and not an array', function() {
            expect(function() {
                return controller.request('ZDO', 'ping', 'x', function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.request('ZDO', 'ping', 1, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.request('ZDO', 'ping', undefined, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.request('ZDO', 'ping', null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.request('ZDO', 'ping', NaN, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.request('ZDO', 'ping', true, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.request('ZDO', 'ping', new Date(), function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.request('ZDO', 'ping', function() {}, function() {});
            }).to.throw(TypeError);

            expect(function() {
                return controller.request('ZDO', 'ping', {}, function() {});
            }).not.to.throw(TypeError);
            expect(function() {
                return controller.request('ZDO', 'ping', [], function() {});
            }).not.to.throw(TypeError);
        });
    });

    describe('#.permitJoin', function() {
        let requestStub;

        before(() => {
            requestStub = sinon.stub(controller, 'request', function(subsys, cmdId, valObj, callback) {
                let deferred = Q.defer();

                setImmediate(function() {
                    deferred.resolve({status: 0});
                });

                return deferred.promise.nodeify(callback);
            });
        });

        after(() => {
            requestStub.restore();
        });

        it('should be a function', function() {
            expect(controller.permitJoin).to.be.a('function');
        });

        it('should throw if joinTime is not a number', () => {
            return Promise.all([
                controller.permitJoin('x', 'coord')
                    .catch((err) => expect(err).to.be.instanceof(TypeError)),
                controller.permitJoin([], 'coord')
                    .catch((err) => expect(err).to.be.instanceof(TypeError)),
                controller.permitJoin({}, 'coord')
                    .catch((err) => expect(err).to.be.instanceOf(TypeError)),
                controller.permitJoin(undefined, 'coord')
                    .catch((err) => expect(err).to.be.instanceOf(TypeError)),
                controller.permitJoin(null, 'coord')
                    .catch((err) => expect(err).to.be.instanceOf(TypeError)),
                controller.permitJoin(NaN, 'coord')
                    .catch((err) => expect(err).to.be.instanceOf(TypeError)),
                controller.permitJoin(true, 'coord')
                    .catch((err) => expect(err).to.be.instanceOf(TypeError)),
                controller.permitJoin(new Date(), 'coord')
                    .catch((err) => expect(err).to.be.instanceOf(TypeError)),
                controller.permitJoin(function() {}, 'coord')
                    .catch((err) => expect(err).to.be.instanceOf(TypeError)),

                controller.permitJoin(10, 'coord'),
            ]);
        });

        it('should throw if joinType is not a number and not a string', () => {
            return Promise.all([
                controller.permitJoin(10, [])
                    .catch((err) => expect(err).to.be.instanceof(TypeError)),
                controller.permitJoin(10, {})
                    .catch((err) => expect(err).to.be.instanceof(TypeError)),
                controller.permitJoin(10, undefined)
                    .catch((err) => expect(err).to.be.instanceof(TypeError)),
                controller.permitJoin(10, null)
                    .catch((err) => expect(err).to.be.instanceof(TypeError)),
                controller.permitJoin(10, NaN)
                    .catch((err) => expect(err).to.be.instanceof(TypeError)),
                controller.permitJoin(10, true)
                    .catch((err) => expect(err).to.be.instanceof(TypeError)),
                controller.permitJoin(10, new Date())
                    .catch((err) => expect(err).to.be.instanceof(TypeError)),
                controller.permitJoin(10, function() {})
                    .catch((err) => expect(err).to.be.instanceof(TypeError)),

                controller.permitJoin(10, 1, function() {}),
                controller.permitJoin(10, 'coord', function() {}),
            ]);
        });
    });

    describe('#.simpleDescReq', function() {
        it('should be a function', function() {
            expect(controller.simpleDescReq).to.be.a('function');
        });

        it('should throw if nwkAddr is not a number', function() {
            expect(function() {
                return controller.simpleDescReq('x', '0x0123456789abcdef', function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.simpleDescReq([], '0x0123456789abcdef', function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.simpleDescReq({}, '0x0123456789abcdef', function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.simpleDescReq(undefined, '0x0123456789abcdef', function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.simpleDescReq(null, '0x0123456789abcdef', function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.simpleDescReq(NaN, '0x0123456789abcdef', function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.simpleDescReq(true, '0x0123456789abcdef', function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.simpleDescReq(new Date(), '0x0123456789abcdef', function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.simpleDescReq(function() {}, '0x0123456789abcdef', function() {});
            }).to.throw(TypeError);

            expect(function() {
                return controller.simpleDescReq(12345, '0x0123456789abcdef', function() {});
            }).not.to.throw(TypeError);
        });

        it('should throw if ieeeAddr is not a string', function() {
            expect(function() {
                return controller.simpleDescReq(12345, 1, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.simpleDescReq(12345, [], function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.simpleDescReq(12345, {}, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.simpleDescReq(12345, undefined, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.simpleDescReq(12345, null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.simpleDescReq(12345, NaN, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.simpleDescReq(12345, true, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.simpleDescReq(12345, new Date(), function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.simpleDescReq(12345, function() {}, function() {});
            }).to.throw(TypeError);

            expect(function() {
                return controller.simpleDescReq(12345, '0x0123456789abcdef', function() {});
            }).not.to.throw(TypeError);
        });
    });

    describe('#.registerEp', () => {
        it('should be a function', () => {
            expect(controller.registerEp).to.be.a('function');
        });

        it('should throw if loEp is not a Coorpoint', () => {
            return Promise.all([
                controller.registerEp('x')
                    .catch((err) => expect(err).to.be.instanceof(TypeError)),
                controller.registerEp(1)
                    .catch((err) => expect(err).to.be.instanceof(TypeError)),
                controller.registerEp([])
                    .catch((err) => expect(err).to.be.instanceof(TypeError)),
                controller.registerEp({})
                    .catch((err) => expect(err).to.be.instanceof(TypeError)),
                controller.registerEp(undefined)
                    .catch((err) => expect(err).to.be.instanceof(TypeError)),
                controller.registerEp(null)
                    .catch((err) => expect(err).to.be.instanceof(TypeError)),
                controller.registerEp(NaN)
                    .catch((err) => expect(err).to.be.instanceof(TypeError)),
                controller.registerEp(true)
                    .catch((err) => expect(err).to.be.instanceof(TypeError)),
                controller.registerEp(new Date())
                    .catch((err) => expect(err).to.be.instanceof(TypeError)),
                controller.registerEp(function() {})
                    .catch((err) => expect(err).to.be.instanceof(TypeError)),
                controller.registerEp(rmEp1)
                    .catch((err) => expect(err).to.be.instanceof(TypeError)),
                controller.registerEp(rmEp2)
                    .catch((err) => expect(err).to.be.instanceof(TypeError)),

                controller.registerEp(loEp1)
                    .catch((err) => expect(err).to.be.instanceof(Error)),
                controller.registerEp(loEp8)
                    .catch((err) => expect(err).to.be.instanceof(Error)),
            ]);
        });
    });

    describe('#.deregisterEp', function() {
        it('should be a function', function() {
            expect(controller.deregisterEp).to.be.a('function');
        });

        it('should throw if loEp is not a Coorpoint', function() {
            expect(function() {
                return controller.deregisterEp('x', function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.deregisterEp(1, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.deregisterEp([], function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.deregisterEp({}, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.deregisterEp(undefined, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.deregisterEp(null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.deregisterEp(NaN, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.deregisterEp(true, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.deregisterEp(new Date(), function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.deregisterEp(function() {}, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.deregisterEp(rmEp1, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.deregisterEp(rmEp2, function() {});
            }).to.throw(TypeError);

            expect(function() {
                return controller.deregisterEp(loEp1, function() {});
            }).not.to.throw(TypeError);
            expect(function() {
                return controller.deregisterEp(loEp8, function() {});
            }).not.to.throw(TypeError);
        });
    });

    describe('#.reRegisterEp', function() {
        it('should be a function', function() {
            expect(controller.reRegisterEp).to.be.a('function');
        });

        it('should throw if loEp is not a Coorpoint', function() {
            expect(function() {
                return controller.reRegisterEp('x', function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.reRegisterEp(1, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.reRegisterEp([], function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.reRegisterEp({}, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.reRegisterEp(undefined, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.reRegisterEp(null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.reRegisterEp(NaN, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.reRegisterEp(true, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.reRegisterEp(new Date(), function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.reRegisterEp(function() {}, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.reRegisterEp(rmEp1, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.reRegisterEp(rmEp2, function() {});
            }).to.throw(TypeError);

            expect(function() {
                return controller.reRegisterEp(loEp1, function() {});
            }).not.to.throw(TypeError);
            expect(function() {
                return controller.reRegisterEp(loEp8, function() {});
            }).not.to.throw(TypeError);
        });
    });

    describe('#.bind', function() {
        it('should be a function', function() {
            expect(controller.bind).to.be.a('function');
        });

        it('should throw if srcEp is not an Endpoint or a Coorpoint', function() {
            expect(function() {
                return controller.bind('x', rmEp1, 'genOnOff', null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.bind(1, rmEp1, 'genOnOff', null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.bind([], rmEp1, 'genOnOff', null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.bind({}, rmEp1, 'genOnOff', null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.bind(undefined, rmEp1, 'genOnOff', null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.bind(null, rmEp1, 'genOnOff', null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.bind(NaN, rmEp1, 'genOnOff', null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.bind(true, rmEp1, 'genOnOff', null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.bind(new Date(), rmEp1, 'genOnOff', null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.bind(function() {}, rmEp1, 'genOnOff', null, function() {});
            }).to.throw(TypeError);
        });

        it('should throw if dstEp is not an Endpoint or a Coorpoint', function() {
            expect(function() {
                return controller.bind(loEp1, 'x', 'genOnOff', null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.bind(loEp1, 1, 'genOnOff', null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.bind(loEp1, [], 'genOnOff', null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.bind(loEp1, {}, 'genOnOff', null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.bind(loEp1, undefined, 'genOnOff', null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.bind(loEp1, null, 'genOnOff', null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.bind(loEp1, NaN, 'genOnOff', null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.bind(loEp1, true, 'genOnOff', null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.bind(loEp1, new Date(), 'genOnOff', null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.bind(loEp1, function() {}, 'genOnOff', null, function() {});
            }).to.throw(TypeError);
        });

        it('should throw if cId is not a number and not a string', function() {
            expect(function() {
                return controller.bind(loEp1, rmEp1, [], null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.bind(loEp1, rmEp1, {}, null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.bind(loEp1, rmEp1, undefined, null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.bind(loEp1, rmEp1, null, null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.bind(loEp1, rmEp1, NaN, null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.bind(loEp1, rmEp1, true, null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.bind(loEp1, rmEp1, new Date(), null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.bind(loEp1, rmEp1, function() {}, null, function() {});
            }).to.throw(TypeError);
        });

        it('should throw if grpId is not a number', function() {
            expect(function() {
                return controller.bind(loEp1, rmEp1, 'genOnOff', 'x', function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.bind(loEp1, rmEp1, 'genOnOff', [], function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.bind(loEp1, rmEp1, 'genOnOff', {}, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.bind(loEp1, rmEp1, 'genOnOff', undefined, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.bind(loEp1, rmEp1, 'genOnOff', null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.bind(loEp1, rmEp1, 'genOnOff', NaN, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.bind(loEp1, rmEp1, 'genOnOff', true, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.bind(loEp1, rmEp1, 'genOnOff', new Date(), function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.bind(loEp1, rmEp1, 'genOnOff', function() {}, function() {});
            }).to.throw(TypeError);
        });
    });

    describe('#.unbind', function() {
        it('should be a function', function() {
            expect(controller.unbind).to.be.a('function');
        });

        it('should throw if srcEp is not an Endpoint or a Coorpoint', function() {
            expect(function() {
                return controller.unbind('x', rmEp1, 'genOnOff', null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.unbind(1, rmEp1, 'genOnOff', null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.unbind([], rmEp1, 'genOnOff', null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.unbind({}, rmEp1, 'genOnOff', null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.unbind(undefined, rmEp1, 'genOnOff', null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.unbind(null, rmEp1, 'genOnOff', null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.unbind(NaN, rmEp1, 'genOnOff', null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.unbind(true, rmEp1, 'genOnOff', null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.unbind(new Date(), rmEp1, 'genOnOff', null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.unbind(function() {}, rmEp1, 'genOnOff', null, function() {});
            }).to.throw(TypeError);
        });

        it('should throw if dstEp is not an Endpoint or a Coorpoint', function() {
            expect(function() {
                return controller.unbind(loEp1, 'x', 'genOnOff', null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.unbind(loEp1, 1, 'genOnOff', null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.unbind(loEp1, [], 'genOnOff', null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.unbind(loEp1, {}, 'genOnOff', null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.unbind(loEp1, undefined, 'genOnOff', null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.unbind(loEp1, null, 'genOnOff', null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.unbind(loEp1, NaN, 'genOnOff', null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.unbind(loEp1, true, 'genOnOff', null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.unbind(loEp1, new Date(), 'genOnOff', null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.unbind(loEp1, function() {}, 'genOnOff', null, function() {});
            }).to.throw(TypeError);
        });

        it('should throw if cId is not a number and not a string', function() {
            expect(function() {
                return controller.unbind(loEp1, rmEp1, [], null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.unbind(loEp1, rmEp1, {}, null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.unbind(loEp1, rmEp1, undefined, null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.unbind(loEp1, rmEp1, null, null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.unbind(loEp1, rmEp1, NaN, null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.unbind(loEp1, rmEp1, true, null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.unbind(loEp1, rmEp1, new Date(), null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.unbind(loEp1, rmEp1, function() {}, null, function() {});
            }).to.throw(TypeError);
        });

        it('should throw if grpId is not a number', function() {
            expect(function() {
                return controller.unbind(loEp1, rmEp1, 'genOnOff', 'x', function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.unbind(loEp1, rmEp1, 'genOnOff', [], function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.unbind(loEp1, rmEp1, 'genOnOff', {}, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.unbind(loEp1, rmEp1, 'genOnOff', undefined, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.unbind(loEp1, rmEp1, 'genOnOff', null, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.unbind(loEp1, rmEp1, 'genOnOff', NaN, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.unbind(loEp1, rmEp1, 'genOnOff', true, function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.unbind(loEp1, rmEp1, 'genOnOff', new Date(), function() {});
            }).to.throw(TypeError);
            expect(function() {
                return controller.unbind(loEp1, rmEp1, 'genOnOff', function() {}, function() {});
            }).to.throw(TypeError);
        });
    });

    describe('#.remove', () => {
        it('should be a function', function() {
            expect(controller.remove).to.be.a('function');
        });

        it('should throw if dev is not a Device', () => {
            return Promise.all([
                controller.remove('x', {})
                    .catch((err) => expect(err).to.be.instanceof(TypeError)),
                controller.remove(1, {})
                    .catch((err) => expect(err).to.be.instanceof(TypeError)),
                controller.remove([], {})
                    .catch((err) => expect(err).to.be.instanceof(TypeError)),
                controller.remove({}, {})
                    .catch((err) => expect(err).to.be.instanceof(TypeError)),
                controller.remove(undefined, {})
                    .catch((err) => expect(err).to.be.instanceof(TypeError)),
                controller.remove(null, {})
                    .catch((err) => expect(err).to.be.instanceof(TypeError)),
                controller.remove(true, {})
                    .catch((err) => expect(err).to.be.instanceof(TypeError)),
                controller.remove(NaN, {})
                    .catch((err) => expect(err).to.be.instanceof(TypeError)),
                controller.remove(new Date(), {})
                    .catch((err) => expect(err).to.be.instanceof(TypeError)),
                controller.remove(() => {}, {})
                    .catch((err) => expect(err).to.be.instanceof(TypeError)),
            ]);
        });

        it('should throw if cfg is not an object', () => {
            return Promise.all([
                controller.remove(remoteDev, 'x')
                    .catch((err) => expect(err).to.be.instanceof(TypeError)),
                controller.remove(remoteDev, 1)
                    .catch((err) => expect(err).to.be.instanceof(TypeError)),
                controller.remove(remoteDev, [])
                    .catch((err) => expect(err).to.be.instanceof(TypeError)),
                controller.remove(remoteDev, undefined)
                    .catch((err) => expect(err).to.be.instanceof(TypeError)),
                controller.remove(remoteDev, null)
                    .catch((err) => expect(err).to.be.instanceof(TypeError)),
                controller.remove(remoteDev, NaN)
                    .catch((err) => expect(err).to.be.instanceof(TypeError)),
                controller.remove(remoteDev, true)
                    .catch((err) => expect(err).to.be.instanceof(TypeError)),
                controller.remove(remoteDev, new Date())
                    .catch((err) => expect(err).to.be.instanceof(TypeError)),
                controller.remove(remoteDev, function() {})
                    .catch((err) => expect(err).to.be.instanceof(TypeError)),
            ]);
        });
    });
});

describe('Functional Check', function() {
    let controller;

    before(function() {
        let bridge = new EventEmitter();

        bridge._findDevByAddr = function() {
            return;
        };

        controller = new Controller(bridge, {path: '/dev/ttyACM0'});
        controller._coord = coordDev;
    });

    describe('#.start', function() {
        it('should init znp', function(done) {
            let initStub = sinon.stub(controller._znp, 'init', function(spCfg, callback) {
                setImmediate(function() {
                    callback(null);
                    controller.emit('ZNP:INIT');
                });
            });

            controller.start()
                .then(() => {
                    initStub.restore();
                    done();
                });
        });
    });

    describe('#.close', function() {
        it('should close znp', function(done) {
            let closeStub = sinon.stub(controller._znp, 'close', function(callback) {
                setImmediate(function() {
                    callback(null);
                    controller.emit('ZNP:CLOSE');
                });
            });

            controller.close()
                .then(() => {
                    closeStub.restore();
                    done();
                });
        });
    });

    describe('#.reset', function() {
        it('soft reset', function(done) {
            let requestStub = sinon.stub(controller, 'request', function(subsys, cmdId, valObj, callback) {
                let deferred = Q.defer();

                setImmediate(function() {
                    deferred.resolve({status: 0});
                });

                return deferred.promise.nodeify(callback);
            });

            controller.once('SYS:resetInd', function(msg) {
                if (msg === '_reset') {
                    controller.emit('_reset');
                }
            });

            controller.reset('soft')
                .then(() => {
                    requestStub.restore();
                    done();
                });
        });

        it('hard reset', function(done) {
            let requestStub = sinon.stub(controller, 'request', function(subsys, cmdId, valObj, callback) {
                let deferred = Q.defer();

                setImmediate(function() {
                    deferred.resolve({status: 0});
                });

                return deferred.promise.nodeify(callback);
            });

            controller.once('SYS:resetInd', function(msg) {
                if (msg === '_reset') {
                    controller.emit('_reset');
                }
            });

            controller.reset('hard')
                .then(() => {
                    requestStub.restore();
                    done();
                });
        });
    });

    describe('#.request', function() {
        it('request ZDO command', function(done) {
            let _zdoRequestStub = sinon.stub(controller._zdo, 'request', function(cmdId, valObj, callback) {
                expect(cmdId).to.be.equal('nodeDescReq');

                setImmediate(function() {
                    callback(null, {status: 0});
                });
            });

            controller.request('ZDO', 'nodeDescReq', {dstaddr: 100, nwkaddrofinterest: 100}, function(err) {
                if (!err) {
                    _zdoRequestStub.restore();
                    done();
                }
            });
        });

        it('request SYS command', function(done) {
            let _znpRequestStub = sinon.stub(controller._znp, 'request', function(subsys, cmdId, valObj, callback) {
                expect(subsys).to.be.equal('SYS');
                expect(cmdId).to.be.equal('resetReq');

                setImmediate(function() {
                    callback(null, {status: 0});
                });
            });

            controller.request('SYS', 'resetReq', {type: 0x01}, function(err) {
                if (!err) {
                    _znpRequestStub.restore();
                    done();
                }
            });
        });
    });

    describe('#.permitJoin', function() {
        it('only permit devices join the network through the coordinator', function(done) {
            let requestStub = sinon.stub(controller, 'request', (subsys, cmdId, valObj, callback) => {
                let deferred = Q.defer();

                expect(valObj.addrmode).to.be.equal(0x02);
                expect(valObj.dstaddr).to.be.equal(0x0000);

                setImmediate(function() {
                    deferred.resolve({status: 0});
                });

                return deferred.promise.nodeify(callback);
            });

            controller.once('permitJoining', function(permitJoinTime) {
                expect(permitJoinTime).to.be.equal(60);
            });

            controller.permitJoin(60, 'coord')
                .then(() => {
                    requestStub.restore();
                    done();
                });
        });

        it('permit devices join the network through the coordinator or routers', function(done) {
            let requestStub = sinon.stub(controller, 'request', function(subsys, cmdId, valObj, callback) {
                let deferred = Q.defer();

                expect(valObj.addrmode).to.be.equal(0x0F);
                expect(valObj.dstaddr).to.be.equal(0xFFFC);

                setImmediate(function() {
                    deferred.resolve({status: 0});
                });

                return deferred.promise.nodeify(callback);
            });

            controller.once('permitJoining', function(permitJoinTime) {
                expect(permitJoinTime).to.be.equal(60);
            });

            controller.permitJoin(60, 'all')
                .then(() => {
                    requestStub.restore();
                    done();
                });
        });
    });

    describe('#.remove', () => {
        it('remove device', (done) => {
            let requestStub = sinon.stub(controller, 'request', (subsys, cmdId, valObj, callback) => {
                let deferred = Q.defer();

                expect(valObj.deviceaddress).to.be.equal('0x123456789abcdef');

                setImmediate(() => {
                    deferred.resolve({status: 0});
                });

                return deferred.promise.nodeify(callback);
            });

            controller.remove(remoteDev, {})
                .then((err) => {
                    requestStub.restore();
                    done();
                });
        });
    });

    describe('#.registerEp', () => {
        it('register loEp1', (done) => {
            let requestStub = sinon.stub(controller, 'request', (subsys, cmdId, valObj, callback) => {
                let deferred = Q.defer();

                expect(cmdId).to.be.equal('register');

                setImmediate(() => {
                    deferred.resolve({status: 0});
                });

                return deferred.promise.nodeify(callback);
            });

            controller.registerEp(loEp1)
                .then(() => {
                    requestStub.restore();
                    done();
                });
        });
    });

    describe('#.deregisterEp', function() {
        it('delete loEp1', function(done) {
            let requestStub = sinon.stub(controller, 'request', function(subsys, cmdId, valObj, callback) {
                let deferred = Q.defer();

                expect(cmdId).to.be.equal('delete');

                setImmediate(function() {
                    deferred.resolve({status: 0});
                });

                return deferred.promise.nodeify(callback);
            });

            controller.getCoord().endpoints[1] = loEp1;

            controller.deregisterEp(loEp1, function(err) {
                if (!err) {
                    requestStub.restore();
                    done();
                }
            });
        });
    });

    describe('#.reRegisterEp', function() {
        it('reRegister loEp1', function(done) {
            let requestStub = sinon.stub(controller, 'request', function(subsys, cmdId, valObj, callback) {
                let deferred = Q.defer();

                setImmediate(function() {
                    deferred.resolve({status: 0});
                });

                return deferred.promise.nodeify(callback);
            });


            let deregisterEpStub = sinon.stub(controller, 'deregisterEp', function(loEp, callback) {
                let deferred = Q.defer();

                setImmediate(function() {
                    deferred.resolve();
                });

                return deferred.promise.nodeify(callback);
            });

            controller.reRegisterEp(loEp1, function(err) {
                if (!err) {
                    requestStub.restore();
                    deregisterEpStub.restore();
                    done();
                }
            });
        });
    });

    describe('#.simpleDescReq', function() {
        it('get remoteDev simple description', function(done) {
            let deviceWithEndpointsStub = sinon.stub(controller.querie, 'deviceWithEndpoints', function(nwkAddr, ieeeAddr, callback) {
                let deferred = Q.defer();

                setImmediate(function() {
                    deferred.resolve({
                        type: 1,
                        ieeeAddr: '0x123456789abcdef',
                        nwkAddr: 100,
                        manufId: 10,
                        epList: [1, 2],
                    });
                });

                return deferred.promise.nodeify(callback);
            });

            controller.simpleDescReq(10, '0x123456789abcdef', function(err, devInfo) {
                expect(devInfo.ieeeAddr).to.be.equal('0x123456789abcdef');

                if (!err) {
                    deviceWithEndpointsStub.restore();
                    done();
                }
            });
        });
    });

    describe('#.bind', function() {
        it('bind loEp1 and rmEp1', function(done) {
            let requestStub = sinon.stub(controller, 'request', function(subsys, cmdId, valObj, callback) {
                let deferred = Q.defer();

                expect(cmdId).to.be.equal('bindReq');

                setImmediate(function() {
                    deferred.resolve({status: 0});
                });

                return deferred.promise.nodeify(callback);
            });

            controller.bind(loEp1, 'genOnOff', rmEp1, function(err) {
                if (!err) {
                    requestStub.restore();
                    done();
                }
            });
        });
    });

    describe('#.unbind', function() {
        it('unbind loEp1 and rmEp1', function(done) {
            let requestStub = sinon.stub(controller, 'request', function(subsys, cmdId, valObj, callback) {
                let deferred = Q.defer();

                expect(cmdId).to.be.equal('unbindReq');

                setImmediate(function() {
                    deferred.resolve({status: 0});
                });

                return deferred.promise.nodeify(callback);
            });

            controller.unbind(loEp1, 'genOnOff', rmEp1, function(err) {
                if (!err) {
                    requestStub.restore();
                    done();
                }
            });
        });
    });

    describe('#.endDeviceAnnceHdlr', function() {
        it('unbind loEp1 and rmEp1', function(done) {
            sinon.stub(controller, 'simpleDescReq', function(nwkAddr, ieeeAddr, callback) {
                let deferred = Q.defer();

                setImmediate(function() {
                    deferred.resolve({
                        type: 1,
                        nwkaddr: nwkAddr,
                        ieeeaddr: ieeeAddr,
                        manufId: 10,
                        epList: [],
                        endpoints: [],
                    });
                });

                return deferred.promise.nodeify(callback);
            });

            let dev1;
            let dev2;

            controller.on('ZDO:devIncoming', function(devInfo) {
                controller.emit('ind:incoming' + ':' + devInfo.ieeeaddr);

                if (devInfo.ieeeaddr === '0x123456789abcdef') {
                    dev1 = true;
                } else if (devInfo.ieeeaddr === '0x00124b000159168') {
                    dev2 = true;
                }

                if (dev1 && dev2) {
                    done();
                }
            });

            controller.emit('ZDO:endDeviceAnnceInd', {
                nwkaddr: 100,
                ieeeaddr: '0x123456789abcdef',
            });
            controller.emit('ZDO:endDeviceAnnceInd', {
                nwkaddr: 200,
                ieeeaddr: '0x00124b000159168',
            });
        });
    });
});