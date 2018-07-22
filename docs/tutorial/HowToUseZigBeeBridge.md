# How to use zigbee-bridge

## 1. Create a folder /zbserver and a **server.js** in it

```sh
$ mkdir zbserver && cd zbserver
```

```sh
/zbserver$ touch server.js
```

## 2. Install the `zigbee-bridge` module in /zbserver folder

```sh
/zbserver$ npm install zigbee-bridge
```

## 3. Edit **server.js**, Start ZigBee Server

* [1] [ZBridge Class](../API.md#zbridge-class)

```js
const ZBridge = require('zigbee-bridge');
const zserver = new ZBridge('/dev/ttyACM0');

// see [1]
zserver.on('ready', () => {
  console.log('Server is ready.');
});

zserver.start(function (err) {
  if (err) {
    console.log(err);
  }
});
```

* **Note:** If you don't know the system path of the serial port, install [serialport](https://www.npmjs.com/package/serialport) globally, then use command line tool `serialport-list` to list all available serial ports.

```sh
$ npm install -g serialport
```

```sh
$ serialport-list
/dev/ttyACM0    usb-Texas_Instruments_TI_CC2531_USB_CDC___0X00124B000106B6C5-if00   Texas_Instruments
/dev/ttyS0
/dev/ttyS1
...
```

## 4. Test the Server

```sh
/zbserver$ node server.js
```

## 5. Permit ZigBee devices join the network  

* [1] [ZBridge Class - event: 'ready'](../API.md#event-ready)
* [2] [ZBridge Class - event: 'ind'](../API.md#event-ind)

```js
var ZBridge = require('zigbee-bridge');
var zserver = new ZBridge('/dev/ttyACM0');

// see [1]
zserver.on('ready', () => {
  console.log('Server is ready. Allow devices to join the network within 180 secs.');
  console.log('Waiting for incoming clients or messages...');
  zserver.permitJoin(180);
});

zserver.on('permitJoining', (joinTimeLeft) => {
  console.log(joinTimeLeft);
});

// see [2]
zserver.on('ind', (msg) => {
  switch (msg.type) {
    case 'devIncoming':
      console.log(`Device: ${msg.data} joining the network!`);
      msg.endpoints.forEach((ep) => {
        console.log(ep.dump());  // endpoint information
      });
      break;
    default:
      // Not deal with other msg.type in this example
      break;
  }
});

zserver.start((err) => {
  if (err) {
    console.log(err);
  }
});
```

Run server.js and Let your ZigBee device join the network.

```sh
/zbserver$ node server.js
```