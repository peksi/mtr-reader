/* config */
var SERIAL_ADDRESS = "/dev/cu.usbserial-141";

/* 
	A node.js serial parser for mtr250 device.
   	Protocol documentation http://ttime.no/rs232.pdf 
 */

var serialport = require("serialport");
var SerialPort = serialport.SerialPort; // localize object constructor

function  youreUsingPort() {
	console.log("\nYou're currently using port:\n" + SERIAL_ADDRESS);
}

serialport.list(function (err, ports) {
	console.log('Available ports are:')

  ports.forEach(function(port) {
    console.log(port.comName);
  });
  youreUsingPort()
});


var sp = new SerialPort(SERIAL_ADDRESS, {
	parser: serialport.parsers.raw,
	stopBits: 2,
});

// Data lays here. Flushed when data is passed forward
var eArr = [];

function parseSerial(data, callback){

	function xor (a) {
		return a ^ 0xDF;
	}

	for (var i = 0; i < data.length; i++) {
		eArr.push(xor( data[i] ));

		// there should be two start bits ( 0xFF ) in a row
		// in case not, let's do some shifts
		if(eArr[0] != 255){
			eArr.shift();
		} else if (eArr[0] == 255 && eArr.length > 1 &&eArr[1] != 255){
			eArr.shift();
			eArr.shift();
		} else if (eArr[0] == 255 && eArr[1] == 255 && eArr.length >= 217){
		// in case we have start bits in front and the whole pack in place, move fwd
			sp.pause();
			callback(null, eArr.slice(0, 217));

		}
	}
}

function validateChecksums(data, cb){
	var byte10 = data.slice(2, 10).reduce(function(pv, cv) { return pv + cv; }, 0);
	var byte217 = data.reduce(function(pv, cv) { return pv + cv; }, 0);
	if(byte10 % 256 != 0){
		err = "Failure in Emit number, try again.";
	} else if (byte217 % 256 != 0) {
		err = "Failure in card reading, try again."
	} else {
		err = null;
	}

	cb(err, data);
}

function parseEmitValues(data, cb){

	function arrayToAscii(arr){
		var retAsciiArr = [];
		for (var i = 0; i < arr.length; i++) {
			retAsciiArr.push(String.fromCharCode(arr[i]));
		};
		return retAsciiArr.join('');
	}

	function parseControlCodes(arr){
		var codes = [];
		var tempTimes = [];
		var times = [];

		for (var i = 0; i < arr.length; i++) {
			if(i%3 == 0){
				codes.push(arr[i]);
			}else{
				tempTimes.push(arr[i]);
			}
		};

		for (var i = 0; i < tempTimes.length; i+=2) {
			times.push((tempTimes[i]) + (tempTimes[i+1]<<8));
		};

		return [codes, times];
	}

	var emitNumber = (data[4]<<16) + (data[3]<<8) + (data[2]);
	var productionWeek = data[6];
	var productionYear = data[7];

	var codes = parseControlCodes(data.slice(10, 160))[0];
	var times = parseControlCodes(data.slice(10, 160))[1];
	var etsInfo = arrayToAscii(data.slice(160, 192));
	var disp1 = arrayToAscii(data.slice(192, 200));
	var numOfDisturbance = parseInt(arrayToAscii(data.slice(201, 205)));
	var numOfTests = parseInt(arrayToAscii(data.slice(206, 210)));
	var numOfRaces = parseInt(arrayToAscii(data.slice(211, 215)));

	var retJSON = {
		"timestamp": Date.now(),
		"emitNumber": emitNumber,
		"controlCodes": {
			"codes": codes,
			"times": times,
		},
		"metadata":{
			"productionWeek": productionWeek,
			"productionYear": productionYear,
			"etsInfo": etsInfo,
			"disp1": disp1,
			"numOfDisturbance": numOfDisturbance,
			"numOfTests": numOfTests,
			"numOfRaces": numOfRaces,			
		}

	}

	cb(null, retJSON);
}

// Serial & XOR -> Check checksum -> Decode

sp.on("data", function (data) {
	parseSerial(data, function (err, data) {
		if(err){console.log(err)}
		validateChecksums(data, function(err, data){
			// flush eArr
			eArr = [];
			// open serial monitor again
			sp.resume();

			if(err){
				console.log(err)
				// TODO: Handle emit code 200

			} else {
				// Move forward
				parseEmitValues(data, function(err, data){
					console.log("\n" + JSON.stringify(data));
				})
				
			}
		});
	});

});


