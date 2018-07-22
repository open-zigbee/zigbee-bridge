# API

- [Major Classes](#major-classes)
- [ZBridge Class](#zbridge-class)
    - [new ZBridge(path[, opts])](#new-zbridgepath-opts)
    - [.start([callback])](#startcallback)
    - [.stop([callback])](#stopcallback)
    - [.reset(mode[, callback])](#resetmode-callback)
    - [.permitJoin(time[, type][, callback])](#permitjointime-type-callback)
    - [.info()](#info)
    - [.mount(zApp, callback)](#mountzapp-callback)
    - [.list([ieeeAddrs])](#listieeeaddrs)
    - [.find(addr, epId)](#findaddr-epid)
    - [.lqi(ieeeAddr, callback)](#lqiieeeaddr-callback)
    - [.remove(ieeeAddr[, cfg][, callback])](#removeieeeaddr-cfg-callback)
    - [.acceptDevIncoming(devInfo, callback)](#acceptdevincomingdevinfo-callback)
    - [Event: 'ready'](#event-ready)
    - [Event: 'error'](#event-error)
    - [Event: 'permitJoining'](#event-permitjoining)
    - [Event: 'ind'](#event-ind)
- [Endpoint Class](#endpoint-class)
    - [.getSimpleDesc()](#getsimpledesc)
    - [.getIeeeAddr()](#getieeeaddr)
    - [.getNwkAddr()](#getnwkaddr)
    - [.foundation(cId, cmd, zclData[, cfg], callback)](#foundationcid-cmd-zcldata-cfg-callback)
    - [.functional(cId, cmd, zclData[, cfg], callback)](#functionalcid-cmd-zcldata-cfg-callback)
    - [.read(cId, attrId, callback)](#readcid-attrid-callback)
    - [.write(cId, attrId, data, callback)](#writecid-attrid-data-callback)
    - [.bind(cId, dstEpOrGrpId[, callback])](#bindcid-dsteporgrpid-callback)
    - [.unbind(cId, dstEpOrGrpId[, callback])](#unbindcid-dsteporgrpid-callback)
    - [.report(cId, attrId, minInt, maxInt[, repChange][, callback])](#reportcid-attrid-minint-maxint-repchange-callback)
    - [.dump()](#dump)

## Major Classes

This module provides you with **ZShepherd** and **Endpoint** classes.

* **ZBridge** class brings you a ZigBee Server with network managing facilities, i.e., start/stop the Server, permit device joining, find a joined endpoint. This document uses `bridge` to denote the instance of this class.

* **Endpoint** is the class for creating a software endpoint to represent the remote or local endpoint at server-side. This document uses `ep` to denote the instance of this class. You can invoke methods on an `ep` to operate the endpoint.

## ZBridge Class

Exposed by `require('zigbee-bridge')`

********************************************

### new ZBridge(path[, opts])

Create a new instance of the `ZBridge` class. The created instance is a ZigBee gateway that runs with node.js.

**Arguments:**

1. `path` (_String_): A string that refers to system path of the serial port connecting to your ZNP (CC253X), e.g., `'/dev/ttyUSB0'`.
2. `opts` (_Object_): This value-object has three properties `sp`, `net` and `dbPath` to configure the serial port, zigbee network settings and database file path.
    - `sp` (_Object_): An optional object to [configure the seiralport](https://www.npmjs.com/package/serialport#serialport-path-options-opencallback). Default is `{ baudrate: 115200, rtscts: true }`.
    - `net` (_Object_): An object to configure the network settings, and all properties in this object are optional. The descriptions are shown in the following table.
    - `dbPath` (_String_): Set database file path, default is `__dirname + '/database/dev.db'`.

| Property           | Type    | Mandatory | Description                                                                                                                                                    | Default value                                                                                      |
|--------------------|---------|-----------|----------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------|
| panId              | Number  | Optional  | Identify the ZigBee PAN. This id should be a value between 0 and 0x3FFF. You can also set it to 0xFFFF to let ZNP choose a random PAN-ID on its own.           | 0xFFFF                                                                                             |
| channelList        | Array   | Optional  | Pick possible channels for your ZNP to start a PAN with. If only a single channel is given, ZNP will start a PAN with the channel you've picked.               | [ 11 ]                                                                                             |
| precfgkey          | Array   | Optional  | This is for securing and un-securing packets. It must be an array with 16 uint8 integers.                                                                      | [ 0x01, 0x03, 0x05, 0x07, 0x09, 0x0B, 0x0D, 0x0F, 0x00, 0x02, 0x04, 0x06, 0x08, 0x0A, 0x0C, 0x0D ] |
| precfgkeysEnable   | Boolean | Optional  | To distribute the security key to all devices in the network or not.                                                                                           | true                                                                                               |
| startoptClearState | Boolean | Optional  | If this option is set, the device will clear its previous network state. This is typically used during application development.                                | false                                                                                              |

**Returns:**

* (_Object_): bridge

**Examples:**

```js
const ZBridge = require('zigbee-bridge');

const bridge = new ZBridge('/dev/ttyUSB0', {
  sp: {
    baudrate: 115200, 
    rtscts: true
  },
  net: {
    panId: 0x1234,
    channelList: [12, 14], // pick CH12 and CH14
    precfgkey: [
      0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
      0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f
    ],
    precfgkeysEnable: true
  }
});
```

********************************************

### .start([callback])

Connect to the ZNP and start bridge.

**Arguments:**

1. `callback` (_Function_): `function (err) { }`. Get called when `bridge` starts.

**Returns:**

* (_Promise_): promise

**Examples:**

```js
// callback style
bridge.start((err) => {
  if (!err) {
    console.log('bridge is now running.');
  }
});

// promise style
bridge.start().then(() => {
  console.log('bridge is now running.');
}).done();
```

********************************************

### .stop([callback])

Disconnect from the ZNP and stop bridge.

**Arguments:**

1. `callback` (_Function_): `function (err) { }`. Get called when `bridge` stops.

**Returns:**

* (_Promise_): promise

**Examples:**

```js
bridge.stop((err) => {
  if (!err) {
    console.log('bridge is stopped.');
  }
});
```

********************************************

### .reset(mode[, callback])

Reset the ZNP.

**Arguments:**

1. `mode` (_String_ | _Number_): Set to `'hard'` or `0` to trigger the hardware reset (SoC resets), and set to `'soft'` or `1` to trigger the software reset (zstack resets).
2. `callback` (_Function_): `function (err) { }`.  Get called when reset completes.

**Returns:**

* (_Promise_): promise

**Examples:**

```js
// hard reset
bridge.reset(0, (err) => {
  if (!err) {
    console.log('reset successfully.');
  }
});

// soft reset
bridge.reset('soft', (err) => {
  if (!err) {
    console.log('reset successfully.');
  }
});
```

********************************************

### .permitJoin(time[, type][, callback])

Allow or disallow devices to join the network. A `permitJoining` event will be fired every tick of countdown (per second) when `bridge` is allowing device to join its network.

**Arguments:**

1. `time` (_Number_): Time in seconds for bridge to allow devices to join the network. This property accepts a value ranging from  `0` to `255`. Given with `0` can immediately close the admission and given with `255` will always allow devices to join in.
2. `type` (_String_ | _Number_): Set it to `'coord'` or `0` to let devices join the network through the coordinator, and set it to `'all'` or `1` to let devices join the network through the coordinator or routers. The default value is `'all'`.
3. `callback` (_Function_): `function (err) { }`. Get called when permitJoining process starts.

**Returns:**

* (_Promise_): promise

**Examples:**

```js
bridge.on('permitJoining', (joinTimeLeft) => {
  console.log(joinTimeLeft);
});

// default is allow devices to join coordinator or routers
bridge.permitJoin(60, (err) => {
  if (!err) {
    console.log('ZNP is now allowing devices to join the network for 60 seconds.');
  }
});

// allow devices only to join coordinator
bridge.permitJoin(60, 'coord');
```

********************************************

### .info()

Returns bridge information.

**Arguments:**

1. none

**Returns:**

* (_Object_): An object that contains information about the server. Properties in this object are given in the following table.

    | Property       | Type    | Description                                                                   |
    |----------------|---------|-------------------------------------------------------------------------------|
    | enabled        | Boolean | Server is up(`true`) or down(`false`)                                         |
    | net            | Object  | Network information, `{ state, channel, panId, extPanId, ieeeAddr, nwkAddr }` |
    | startTime      | Number  | Unix Time (secs from 1970/1/1)                                                |
    | joinTimeLeft   | Number  | How many seconds left for allowing devices to join the Network                |

**Examples:**

```js
bridge.info();

/*
{
  enabled: true,
  net: {
    state: 'Coordinator',
    channel: 11,
    panId: '0x7c71',
    extPanId: '0xdddddddddddddddd',
    ieeeAddr: '0x00124b0001709887',
    nwkAddr: 0
  },
  startTime: 1473415541,
  joinTimeLeft: 49
}
*/
```

********************************************

### .mount(zApp, callback)

Mounts a zigbee application `zApp` that will be registered to the coordinator as a local endpoint, where `zApp` is an instance created by the ZCL framework [zive](https://github.com/zigbeer/zive). With **zive**, all you have to do is to plan your clusters well and **zive** itself will handle all ZCL messages for you.

**Arguments:**

1. `zApp` (_Object_): instance of Zive class.
2. `callback` (_Function_): `function (err, epId) { }`. When `zApp` mounts to coordinator successfully, bridge will return you a registered endpoint id. This `epId` is something that helps bridge route all messages going to the `zApp`.

**Returns:**

* (_Promise_): promise

**Examples:**

```js
const myZbApp = require('./lib/myZbApp.js'); // myZbApp is an instance of Zive

bridge.mount(myZbApp, (err, epId) => {
  if (!err) {
    console.log(epId);  // 12
  }
});
```

********************************************

### .list([ieeeAddrs])

Lists the information of devices managed by bridge. The argument accepts a single ieee address or an array of ieee addresses, and the output will always be an array of the corresponding records. All device records will be listed out if `ieeeAddrs` is not given.

**Arguments:**

1. `ieeeAddrs` (_String_ | _String[]_): The ieee address(es) of device(s) you'd like to list.

**Returns:**

* (_Array_): An array of the devices records. Each record is a data object or `undefined` if device is not found.

**Examples:**

```js
bridge.list(); // list all

/*
[ 
  {
    type: 'Router',
    ieeeAddr: '0x00124b0001ce4beb',
    nwkAddr: 55688,
    status: 'online',
    joinTime: 1469528238,
    manufId: 0,
    epList: [ 8 ],
  },
  {
    type: 'EndDevice',
    ieeeAddr: '0x00124b0001ce3631',
    nwkAddr: 11698,
    status: 'offline',
    joinTime: 1469528238,
    manufId: 0,
    epList: [ 8 ],
  },
  ...
]
*/

bridge.list('0x00124b0001ce4beb'); // equivalent to bridge.list([ '0x00124b0001ce4beb' ]);

/*
[ 
  {
    type: 'Router',
    ieeeAddr: '0x00124b0001ce4beb',
    nwkAddr: 55688,
    ...
  }
]
*/

bridge.list('no_such_device'); // equivalent to bridge.list([ 'no_such_device' ]);

// [ undefined ]

bridge.list([ '0x00124b0001ce4beb', 'no_such_device', '0x00124b0001ce3631']);

/*
[ 
  {
    type: 'Router',
    ieeeAddr: '0x00124b0001ce4beb',
    nwkAddr: 55688,
    ...
  },
  undefined,
  {
    type: 'EndDevice',
    ieeeAddr: '0x00124b0001ce3631',
    nwkAddr: 11698,
    ...
  }
]
*/
```

********************************************

### .find(addr, epId)

Find an endpoint instance by address and endpoint id.

**Arguments:**

1. `addr` (_String_ | _Number_): Find by ieee address if `addr` is given with a string, or find by network address if it is given with a number.
2. `epId` (_Number_): The endpoint id to find with.

**Returns:**

* (_Object_): Returns the found endpoint, otherwise `undefined`.

**Examples:**

```js
bridge.find('no_such_ieee_addr', 10);  // undefined, find no device by this ieee address
bridge.find('0x00124b0001ce4beb', 7);  // undefined, find no device by this endpoint id
bridge.find(1244, 10);                 // undefined, find no device by this network address
bridge.find(1200, 7);                  // undefined, find no device by this endpoint id

bridge.find(1200, 10);                 // object, the endpoint instance
bridge.find('0x00124b0001ce4beb', 10); // object, the endpoint instance
```

********************************************

### .lqi(ieeeAddr, callback)

Query the link quality index from a certain device by its ieee address.

**Arguments:**

1. `ieeeAddr` (_String_): Ieee address of the device.
2. `callback` (_Function_): `function (err, data) { }`. This method returns you the link quality index via `data`. An error occurs if device not found.

**Returns:**

* (_Promise_): promise

**Examples:**

```js
bridge.lqi('0x00124b0001ce4beb', (err, data) => {
  if (!err) {
    console.log(data);
    /*
    [
      {
        ieeeAddr: '0x00124b0001ce3631',
        lqi: 62
      },
      {
        ieeeAddr: '0x00124b00019c2ee9',
        lqi: 70
      }
    ]
    */
  }
});
```

********************************************

### .remove(ieeeAddr[, cfg][, callback])

Remove the device from the network.

**Arguments:**

1. `ieeeAddr` (_String_): Ieee address of the device.
2. `cfg` (_Object_):
    - `reJoin` (_Boolean_): Set to `true` if device is allowed for re-joining, otherwise `false`. Default is `true`.
    - `rmChildren` (_Boolean_): Set to `true` will remove all children of this device as well. Default is `false`.
3. `callback` (_Function_): `function (err) { }`.

**Returns:**

* (_Promise_): promise

**Examples:**

```js
bridge.remove('0x00124b0001ce4beb', (err) => {
  if (!err) {
    console.log('Successfully removed!');
  }
});

// remove and ban [TODO: how to unban???]
bridge.remove('0x00124b0001ce4beb', { reJoin: false }, (err) => {
  if (!err) {
    console.log('Successfully removed!');
  }
});
```

********************************************

### .acceptDevIncoming(devInfo, callback)

Accept or reject the device join the network. Overridable.

**Arguments:**

1. `devInfo` (_Object_): An object that contains the ieee address and endpoints of the device.

| Property  | Type     | Description                        |  
|-----------|----------|------------------------------------|  
| ieeeAddr  | String   | Ieee address of the device.        |  
| endpoints | Object[] | An array of the endpoint instance. |  

2. `callback` (_Function_): `function (err, accepted) {}`, the callback you should call and pass the `accepted` (_Boolean_) to it.

**Returns:**

* _none_

**Examples:**

```js
bridge.acceptDevIncoming = (devInfo, callback) => {
  if (devInfo.ieeeAddr === '0x00124b0001ce4beb') {
    callback(null, false);
  } else {
    callback(null, true);
  }
};
```

********************************************

### Event: 'ready'

**Listener:** `function () { }`

Fired when Server is ready.

********************************************

### Event: 'error'

**Listener:** `function (err) { }`

Fired when there is an error occurs.

********************************************

### Event: 'permitJoining'

**Listener:** `function (joinTimeLeft) {}`

Fired when the Server is allowing for devices to join the network, where `joinTimeLeft` is number of seconds left to allow devices to join the network. This event will be triggered at each tick of countdown (per second).

********************************************

### Event: 'ind'

**Listener:** `function (msg) { }`

Fired when there is an incoming indication message. The `msg` is an object with the properties given in the table:

| Property       | Type                 | Description                                                                                                                                                    |
|----------------|----------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------|
| type           | String               | Indication type, can be `'devIncoming'`, `'devLeaving'`, `'devChange'`, `'devStatus'`, and `'attReport'`.                                                      |
| endpoints      | Object[] \| Number[] | An array of the endpoint instance, except that when `type === 'devLeaving'`, endpoints will be an array of the endpoint id (since endpoints have been removed) |
| data           | Depends              | Data along with the indication, which depends on the type of indication                                                                                        |


* ##### devIncoming

  Fired when there is a ZigBee Device incoming to the network.  

  * msg.type: `'devIncoming'`
  * msg.endpoints: `[ ep, ... ]`
  * msg.data: `'0x00124b0001ce4beb'`, the ieee address of which device is incoming.

  ```js
  {
    type: 'devIncoming',
    endpoints: [ ep_instance, ep_instance ],
    data: '0x00124b0001ce4beb'
  }
  ```

* ##### devLeaving

  Fired when there is a ZigBee Device leaving the network.  

  * msg.type: `'devLeaving'`
  * msg.endpoints: `[ epId, ... ]`, the endpoint id of which endpoint is leaving
  * msg.data: `'0x00124b0001ce4beb'`, the ieee address of which device is leaving.

  ```js
  {
    type: 'devLeaving',
    endpoints: [ epId, epId ],
    data: '0x00124b0001ce4beb'
  }
  ```

* ##### devChange

  Fired when the Server perceives any changes of _Attributes_ from ZCL foundation/functional responses.

  * msg.type: `'devChange'`
  * msg.endpoints: `[ep]`
  * msg.data: Content of the changes. This object has fields of `cid` and `data`.

  ```js
  {
    type: 'devChange',
    endpoints: [ ep_instance ],
    data: {
      cid: 'genOnOff',
      data: {
        onOff: 1
      }
    }
  }
  ```

* ##### devStatus

  Fired when there is a ZigBee Device going online or going offline.  

  * msg.type: `'devStatus'`
  * msg.endpoints: `[ ep, ... ]`
  * msg.data: `'online'` or `'offline'`

  ```js
  {
    type: 'devStatus',
    endpoints: [ ep_instance, ep_instance ],
    data: 'online'
  }
  ```

* ##### attReport  
  Fired when the ZigBee Device report attributes.  

  * msg.type: `'attReport'`  
  * msg.endpoints: `[ep]`  
  * msg.data: Content of the report. This object has fields of `cid` and `data`. 

  ```js
  {
    type: 'attReport',
    endpoints: [ ep_instance ],
    data: {
      cid: 'msTemperatureMeasurement',
      data: {
        measuredValue: 2515
      }
    }
  }
  ```

********************************************

## Endpoint Class

This class provides you with methods to operate the remote endpoints or local endpoints. An instance of this class is denoted as `ep` in this document.

********************************************

### .getSimpleDesc()

Returns the simple descriptor of the endpoint.

**Arguments:**

1. none

**Returns:**

* (_Object_): An object that contains information about the endpoint. Fields in this object are given in the following table.

| Property       | Type   | Description                                                 |
|----------------|--------|-------------------------------------------------------------|
| profId         | Number | Profile id for this endpoint                                |
| epId           | Number | Endpoint id                                                 |
| devId          | Number | Device description id for this endpoint                     |
| inClusterList  | Array  | List of input cluster Ids                                   |
| outClusterList | Array  | List of output cluster Ids                                  |

**Examples:**

```js
var ep = shepherd.find('0x00124b0001ce4beb', 8);
ep.getSimpleDesc();

/*
{
  profId: 260,
  epId: 8,
  devId: 0,
  inClusterList: [ 0, 3 ],
  outClusterList: [ 3, 6 ]
}
*/
```

********************************************

### .getIeeeAddr()
Returns ieee address of the device holding this endpoint.

**Arguments:**

1. none

**Returns:**

* (_String_): Ieee address of the device.

**Examples:**

```js
ep1.getIeeeAddr();  // '0x00124b0001ce4beb'
ep2.getIeeeAddr();  // '0x00124b0001ce3631'
```

********************************************

### .getNwkAddr()

Returns network address of the device holding this endpoint.

**Arguments:**

1. none

**Returns:**

* (_Number_): Network address of the device.

**Examples:**

```js
ep1.getNwkAddr();  // 55688
ep2.getNwkAddr();  // 11698
```

********************************************

### .foundation(cId, cmd, zclData[, cfg], callback)

Send ZCL foundation command to this endpoint. Response will be passed through second argument of the callback.

**Arguments:**

1. `cId` (_String_ | _Number_): [Cluster id](https://github.com/zigbeer/zcl-id/wiki#Table), i.e. `'genBasic'`, `0`, `'genOnOff'`, `6`.
2. `cmd` (_String_ | _Number_): [ZCL foundation command id](https://github.com/zigbeer/zcl-packet/wiki/6.-Appendix#FoundCmdTbl), i.e. `'read'`, `0`, `'discover'`, `12`.
3. `zclData` (_Object_ | _Array_): [zclData](https://github.com/zigbeer/zcl-packet/wiki/6.-Appendix#FoundCmdTbl), which depends on the specified command.
4. `cfg` (_Object_):  
    - `manufSpec` (_Number_): Tells if this is a manufacturer-specific command. Default is `0`.  
    - `disDefaultRsp` (_Number_): Disable default response. Default is `0` to enable the default response.  
5. `callback` (_Function_): `function (err, rsp) { }`. Please refer to [**Payload** in foundation command table](https://github.com/zigbeer/zcl-packet/wiki/6.-Appendix#FoundCmdTbl) to learn more about the `rsp` object.

**Returns:**

* (_Promise_): promise

**Examples:**

```js
ep.foundation('genBasic', 'read', [{ attrId: 3 }, { attrId: 4 }], (err, rsp) => {
  if (!err) {
    console.log(rsp);
    /*
    [
      {
        attrId: 3,     // hwVersion
        status: 0,     // success
        dataType: 32,  // uint8
        attrData: 0
      },
      {
        attrId: 4,     // manufacturerName
        status: 0,     // success
        dataType: 66,  // charStr
        attrData: 'TexasInstruments'
      }
    ]
    */
  }
});
```

********************************************

### .functional(cId, cmd, zclData[, cfg], callback)

Send ZCL functional command to this endpoint. The response will be passed to the second argument of the callback.

**Arguments:**

1. `cId` (_String_ | _Number_): [Cluster id](https://github.com/zigbeer/zcl-id/wiki#Table).
2. `cmd` (_String_ | _Number_): [Functional command id](https://github.com/zigbeer/zcl-packet/wiki/6.-Appendix#FuncCmdTbl).
3. `zclData` (_Object_ | _Array_): [zclData](https://github.com/zigbeer/zcl-packet/wiki/6.-Appendix#FuncCmdTbl) depending on the given command.
4. `cfg` (_Object_):  
    - `manufSpec` (_Number_): Tells if this is a manufacturer-specific command. Default is `0`.  
    - `disDefaultRsp` (_Number_): Disable default response. Default is `0` to enable the default response.
5. `callback` (_Function_): `function (err, rsp) { }`. Please refer to [**Arguments** in functional command table](https://github.com/zigbeer/zcl-packet/wiki/6.-Appendix#FuncCmdTbl) to learn more about the functional command `rsp` object.

**Returns:**

* (_Promise_): promise

**Examples:**

```js
// This example receives a 'defaultRsp'
ep.functional('genOnOff', 'toggle', {}, (err, rsp) => {
  if (!err) {
    console.log(rsp);
    /*
    {
      cmdId: 2,
      statusCode: 0
    }
    */
  }
});
```

********************************************

### .read(cId, attrId, callback)

The shorthand to read a single attribute.

**Arguments:**

1. `cId` (_String_ | _Number_): [Cluster id](https://github.com/zigbeer/zcl-id/wiki#Table).
2. `attrId` (_String_ | _Number_): [Attribute id](https://github.com/zigbeer/zcl-id/blob/master/definitions/cluster_defs.json) of which attribute you like to read.
3. `callback` (_Function_): `function (err, data) { }`. This `data` is the attribute value.

**Returns:**

* (_Promise_): promise

**Examples:**

```js
ep.read('genBasic', 'manufacturerName', (err, data) => {
  if (!err) {
    console.log(data);  // 'TexasInstruments'
  }
});
```

********************************************

### .write(cId, attrId, data, callback)

The shorthand to write a single attribute.

**Arguments:**

1. `cId` (_String_ | _Number_): [Cluster id](https://github.com/zigbeer/zcl-id/wiki#Table).
2. `attrId` (_String_ | _Number_): [Attribute id](https://github.com/zigbeer/zcl-id/blob/master/definitions/cluster_defs.json) of which attribute you like to write.
3. `data` (_String_ | _Number_): Depends on the type of [attribute](https://github.com/zigbeer/zcl-id/blob/master/definitions/cluster_defs.json).
4. `callback` (_Function_): `function (err, data) { }`. This `data` is the attribute value.

**Returns:**

* (_Promise_): promise

**Examples:**

```js
ep.write('genBasic', 'locationDesc', 'office', (err, data) => {
  if (!err) {
    console.log(data);  // 'office'
  }
});
```

********************************************

### .bind(cId, dstEpOrGrpId[, callback])

Bind this endpoint to the other endpoint or to a group with the specified cluster.

**Arguments:**

1. `cId` (_String_ | _Number_): [Cluster id](https://github.com/zigbeer/zcl-id/wiki#Table).
2. `dstEpOrGrpId` (_Object_ | _Number_): Bind this endpoint to the other endpoint if `dstEpOrGrpId` is given with an instance of the Endpoint class, or bind this endpoint to a group if it is given with a numeric id.
3. `callback` (_Function_): `function (err) { }`. An error will occur if binding fails.

**Returns:**

* (_Promise_): promise

**Examples:**

```js
const ep1 = shepherd.find('0x00124b0001ce4beb', 8);
const ep2 = shepherd.find('0x00124b00014a7dd2', 12);

// bind ep1 to ep2
ep1.bind('genOnOff', ep2, (err) => {
  if (!err) {
    console.log('Successfully bind ep1 to ep2!');
  }
});

ep1.bind('genOnOff', 3, (err) => {
  if (!err) {
    console.log('Successfully bind ep1 to group of id 3.');
  }
});
```

********************************************

### .unbind(cId, dstEpOrGrpId[, callback])

Unbind this endpoint from the other endpoint or from a group with the specified cluster.

**Arguments:**

1. `cId` (_String_ | _Number_): [Cluster id](https://github.com/zigbeer/zcl-id/wiki#Table).
2. `dstEpOrGrpId` (_Object_ | _Number_): Unbind with endpoint if `dstEpOrGrpId` is given with an instance of the Endpoint class , or unbind this endpoint from a group if it is given with a numeric id.
3. `callback` (_Function_): `function (err) { }`. An error will occur if unbinding fails.

**Returns:**

* (_Promise_): promise

**Examples:**

```js
ep1.unbind('genOnOff', ep2, (err) => {
  if (!err) {
    console.log('Successfully unbind ep1 from ep2!');
  }
});

ep1.unbind('genOnOff', 3, (err) => {
  if (!err) {
    console.log('Successfully unbind ep1 from group of id 3.');
  }
});
```

********************************************

### .report(cId, attrId, minInt, maxInt[, repChange][, callback])

Set the report configuration of the attribute to endpoint.

**Arguments:**  

1. `cId` (_String_ | _Number_): [Cluster id](https://github.com/zigbeer/zcl-id/wiki#Table).
2. `attrId` (_String_ | _Number_): [Attribute id](https://github.com/zigbeer/zcl-id/blob/master/definitions/cluster_defs.json) of which attribute you like to report.
3. `minInt` (_Number_): The minimum reporting interval, in seconds.
4. `maxInt` (_Number_): The maximum reporting interval, in seconds.
5. `repChange` (_Number_): Reportable change. The attribute should report its value when the value is changed more than this setting. If attributes with **analog** data type this argument is mandatory.
6. `callback` (_Function_): `function (err) { }`. An error will occur if configure reporting fails.

**Returns:**

* (_Promise_): promise

**Examples:**

```js
ep1.report('msTemperatureMeasurement', 'measuredValue', 3, 5, 100, (err) => {
  if (!err) {
    console.log('Successfully configure ep1 report temperature attribute!');
  }
});
```

********************************************

### .dump()

Dump the endpoint record.

**Arguments:**

1. none

**Returns:**

* (_Object_): A data object, which is the endpoint record.

| Property       | Type   | Description                                                 |
|----------------|--------|-------------------------------------------------------------|
| profId         | Number | Profile id for this endpoint                                |
| epId           | Number | Endpoint id                                                 |
| devId          | Number | Device description id for this endpoint                     |
| inClusterList  | Array  | List of input cluster Ids                                   |
| outClusterList | Array  | List of output cluster Ids                                  |
| clusters       | Object | Clusters information                                        |

**Examples:**

```js
ep.dump();

/*
{
  profId: 260,
  epId: 8,
  devId: 0,
  inClusterList: [ 0, 3 ],
  outClusterList: [ 3, 6 ],
  clusters: {
    genBasic: {
      dir: { value: 1 },  // in Cluster
      attrs: {
        hwVersion: 0,
        manufacturerName: 'TexasInstruments',
        modelId: 'TI0001',
        dateCode: '20060831',
        powerSource: 1,
        locationDesc: '',
        physicalEnv: 0,
        deviceEnabled: 1
      }
    },
    genIdentify: {
      dir: { value: 3 },  // in and out Cluster
      attrs: {
        identifyTime: 0
      }
    },
    genOnOff:{
      dir: { value: 2 },  // out Cluster
      attrs: {
        onOff: 0
      }
    }
  }
}
*/
```