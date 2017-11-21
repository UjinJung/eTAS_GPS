app.controller('AppCtrl', function ($scope, $ionicModal, $ionicPopover, $timeout, $location, $ionicPopup, $rootScope, ngFB) {

  // With the new view caching in Ionic, Controllers are only called
  // when they are recreated or on app start, instead of every page change.
  // To listen for when this page is active (for example, to refresh data),
  // listen for the $ionicView.enter event:
  //$scope.$on('$ionicView.enter', function(e) {
  //});

  // Form data for the login modal
  $scope.loginData = {};


  $scope

  //--------------------------------------------
  $scope.login = function (user) {
    if (typeof (user) == 'undefined') {
      $scope.showAlert('Please fill username and password to proceed.');
      return false;
    }

    firebase.auth().signInWithEmailAndPassword(user.username, user.password)
      .then(function (authData) {
        $rootScope.authData = authData;
        $rootScope.authData.loginType = "email";
        $location.path('/tab/measure');
        $scope.showAlert('You autorized!');
      })
      .catch(function (e) {
        $scope.showAlert('Invalid username or password.');
        lastWork = "signIn";
        $("#error #errmsg").html(e.message);
        return false;
      });
  };

  //--------------------------------------------
  $scope.signup = function (user) {

    if (typeof (user) == 'undefined') {
      $scope.showAlert('Please fill username and password to proceed.');
      return false;
    }

    if (user.pw != user.cf) {
      $scope.showAlert("Password does not match the confirm password.");
      return false;
    }


    firebase.auth().createUserWithEmailAndPassword(user.id, user.pw)
      .then(function (authData) {
        $rootScope.authData = authData;
        $rootScope.authData.loginType = "email";
        $scope.showAlert('Signed Up!');
        $location.path('/app/login');
      })
      .catch(function (e) {
        $("#error #errmsg").html(e.message);
        return false;
      });


  };

  //--------------------------------------------
  $scope.logout = function () {
    $location.path('/app/login');
  };

  //--------------------------------------------
  // An alert dialog
  $scope.showAlert = function (msg) {
    var alertPopup = $ionicPopup.alert({
      title: 'Warning Message',
      template: msg
    });
  };
  //--------------------------------------------
  /*
    install reference
      cordova plugin add cordova-plugin-inappbrowser
      https://github.com/ccoenraets/OpenFB
   */

  $scope.fbLogin = function () {
    ngFB.login({
      scope: 'email,publish_actions'
    }).then(
      function (response) {
        if (response.status === 'connected') {
          console.log('Facebook login succeeded');
          location.href = "#/tab/measure";
        } else {
          alert('Facebook login failed');
        }
      });
  };

  $scope.fbLogout = function () {
    facebookConnectPlugin.logout(function () {
      location.href = "#/login"
    }, function () {

    });
  };
  //--------------------------------------------
});

app.controller('measureCtrl', function ($scope, $ionicPlatform, $ionicSideMenuDelegate, $cordovaDeviceMotion, $deviceGyroscope, $firebaseArray, $ionicLoading, $cordovaGeolocation, RealTime, errorRecords) {

  /*
   * Clustering
   */

  // Draw Map
  // Initialze Coordinates
  var lat = 37.281;
  var long = 127.041;
  var myLatlng = new google.maps.LatLng(lat, long);
  
  var mapOption = {
    center: myLatlng,
    zoom: 16,
    mapTypeId: google.maps.MapTypeId.ROADMAP
  };
  var map = new google.maps.Map(document.getElementById("errormap"), mapOption);
  // End Draw Map

  // Cluster Function
  var clusterMarkersArray = [];
  function errorClustering(errItem, map) {
    var pushArray = [];

    setMarkersArray(map, errItem, pushArray);
    clusterMarkersArray.push(pushArray);

    markerClusterer = new MarkerClusterer(map, clusterMarkersArray[clusterMarkersArray.length - 1], {
      TTStext: errItem[0].name,
      imagePath: 'https://developers.google.com/maps/documentation/javascript/examples/markerclusterer/m'
    });
  };
  // End Cluster Function

  // Load errorList and Error Markers clustering
  var errorRef = firebase.database().ref("errorList");
  var errorList = $firebaseArray(errorRef);
  var keepGoing = true;
  var errorCnt = 0;
  errorList.$loaded()
    .then(function (x) {
      errorRecords.clear();
      errorCnt = 0;

      angular.forEach(x, function (x) {
        if (keepGoing) {
          if (errorCnt == errorList.length) {
            keepGoing = false;
          }
          x.id = errorCnt;
          errorRecords.push(x);
          errorCnt++;
        }
        keepGoing = true;
      })

      var errorItem = errorRecords.all();
      errorRecords.stateChange();

      for (var k = 0; k < 11; k++) {
        errorClustering(errorItem[k], map);
      }

      console.log(clusterMarkersArray);
    })
    .catch(function (error) {
      console.log("Error:", error);
    });
  // End error Clustering


  $scope.toggleLeft = function () {
    $ionicSideMenuDelegate.toggleLeft();
  };

  $scope.options = {
    frequency: 100 
  };

  // Current measurements
  $scope.measurements = {
    x_a: null,
    y_a: null,
    z_a: null,
    x_g: null,
    y_g: null,
    z_g: null,
    second: 60
  };

  // Watcher object
  $scope.watch = null;
  $scope.watch2 = null;
  $scope.watch3 = null;

  const beta = 0.033;
  const gravity = 9.80665;
  const speedLimit = 80;

  var obj = {
    accVel: 0,
    speed: 0,
    angularVel: 0,
    rotationL: 0,
    rotationR: 0,
    uturn: 0,
    acc: 0,
    start: 0,
    dcc: 0,
    stop: 0,
    CC: 0,
    CF: 0,
    SL: 0,
    LSL: 0
  };

  var madgwick = new AHRS({
    /*
     * The sample interval, in Hz.
     */
    sampleInterval: $scope.options.frequency,

    /*
     * Choose from the `Madgwick` or `Mahony` filter.
     */
    algorithm: 'Madgwick',

    /*
     * The filter noise value, smaller values have
     * smoother estimates, but have higher latency.
     * This only works for the `Madgwick` filter.
     */
    beta: beta
  });

  var x_a, y_a, z_a, x_g, y_g, z_g, date, initQ, tmpQ, cnt = 0,
    sum3 = 0,
    sum6 = 0,
    /* judgeTimeX
     * X 위험행동이 판정되어진 시간 
     */
    judgeTime3 = 0,
    judgeTime6 = 0,
    judgeTimeAcc = 0,
    judgeTimeDcc = 0,
    judgeTimeStart = 0,
    judgeTimeStop = 0,
    judgeTimeSL = 0,
    judgeTimeLSL = 0,
    judgeTimeCC = 0,
    /*
     * judgeCntX
     * X 위험행동이 판정된 횟수 
     */
    judgeCntSL = 0,
    judgeCntLSL = 0,
    judgeCnt3L = 0,
    judgeCnt3R = 0,
    judgeCnt6 = 0,
    judgeCntAcc = 0,
    judgeCntStart = 0,
    judgeCntDcc = 0,
    judgeCntStop = 0,
    judgeCntCC = 0,
    judgeCntCF = 0,
    /*
     * 급진로변경 / 급앞지르기 때문에 3개 필요
     */
    angularVel = 0,
    angularVelFor5 = 0,
    angularVel_cur = 0,
    // For average speed
    speedSum = 0,
    // 장기 과속 시간 체크
    CntLSL = 0,

    accGPS = 0,
    timeG = 0,
    errorAngle3 = errorAngle6 = false;
    // speed = 0,
    // acc = 0,
   
  // Data storage
  var rotationAng = [];
  var uturnAng = [];
  var rotationCntL = [];
  var rotationCntR = [];
  var uturnCnt = [];
  var SLCnt = [];
  var LSLCnt = [];
  var AccCnt = [];
  var StartCnt = [];
  var DccCnt = [];
  var StopCnt = [];
  var CCCnt = [];
  var CFCnt = [];
  var rotationErr = [];
  var uturnErr = [];
  // GPS Speed Queue
  var speedGPSQueue = [];
  // Speed calculation via GPS speed
  var speedList = [];
  var accList = [];
  // Device sensor
  var sensorQueue = [];
  var compareQueue = [];
  var angularList = [];
  // GPS로 speed 측정 시 cntGPS 상승
  // GPSQueue에 enqueue 차량이 멈추었는지 chk
  var GPSQueue = [];
  var cntGPS = 0;
  // 급출발 시 시작 속도 chk; obj.speed : 현재 속도
  var speedQueue = [];
  var positionList = [];
  var errorList = [];

  // Delete
  var timeGQueue = [];
  // var accQueue = [];
  

  var ref = firebase.database().ref("record");
  var list = $firebaseArray(ref);

  const calTime = 6000;
  const secondCnt = (1000 / $scope.options.frequency); // 10
  var mixBut = document.getElementById("mixBut");
  mixBut.addEventListener("click", startWatching);

  // Start Watching Function
  function startWatching() {
    if (cnt == 0) {
      var gpsSpeed = 0;
      var lati, long, myLatlng, accuracy;

      $ionicLoading.show({
        template: '<ion-spinner icon="bubbles"></ion-spinner><br/>data calibarion!'
      });

      /*
       * Google Maps API
       * Find position coord, speed, ...
       */
      // Google Maps Geolocation option
      function geo_success(position) {
        lati = position.coords.latitude;
        long = position.coords.longitude;
        gpsSpeed = position.coords.speed * (3600 / 1000);
        accuracy = position.coords.accuracy;

        myLatlng = new google.maps.LatLng(lati, long);
        map.setCenter(myLatlng);
        positionList.push({
          lat: lati,
          lng: long
        });
        if (position.coords.speed) {
          speedGPSQueue.push(gpsSpeed);
          timeGQueue.push(position.timestamp);
        }

        if (speedGPSQueue[1]) {
          accGPS = (speedGPSQueue[1] - speedGPSQueue[0]);

          cntGPS++;
          speedGPSQueue.shift();
        }
        if (timeGQueue[1]) {
          timeG = (timeGQueue[1] - timeGQueue[0]) / 1000;

          timeGQueue.shift();
        }

        if (speedGPSQueue[0]) {
          obj.speed = Math.round(speedGPSQueue[0]);
          obj.accVel = Math.round(accGPS);
        } else {
          obj.speed = 0;
          obj.accVel = 0;
        }
      }
      function geo_error() {
        console.log(err);
      }
      var geo_options = {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 3000
      };

      // Find position and speed and ...
      $scope.watch3 = navigator.geolocation.watchPosition(geo_success, geo_error, geo_options);

      // second : 60 / frequency : 100
      // var MaxQueue = ($scope.measurements.second * 200) / $scope.options.frequency;
      var MaxQueue = $scope.measurements.second;
      var errorRate = 0.04 / secondCnt;

      for (var i = 0; i < MaxQueue; i++)
        compareQueue.push(0);

      // Device motion configuration
      $scope.watch = $cordovaDeviceMotion.watchAcceleration($scope.options);
      $scope.watch2 = $deviceGyroscope.watch($scope.options);


      // Device motion initilaization
      $scope.watch.then(null, function (error) {
        console.log('Error');
      }, function (result) {
        // Set current Acc data
        x_a = result.x;
        y_a = result.y;
        z_a = result.z;
      });


      // Device motion initilaization
      $scope.watch2.then(null, function (error) {
        console.log('Error');
      }, function (result) {
        // Set current Gyro data
        x_g = result.x;
        y_g = result.y;
        z_g = result.z;


        madgwick.update(x_g, y_g, z_g, x_a, y_a, z_a, cnt);


        if (cnt == calTime / $scope.options.frequency) {
          initQ = madgwick.conj(); //Current posture estimation
          date = Date();
          $ionicLoading.hide();
          location.href = "#/tab/dash";
        }

        /*
         * Calibration finish
         * measurement start
         */
        if (cnt > calTime / $scope.options.frequency) {
          tmpQ = madgwick.getQuaternion();

          RealTime.setId(cnt);

          if (cnt % 10 == 0) {
            GPSQueue.push(cntGPS);
            $scope.measurements.test3 = cntGPS;

            if (GPSQueue[1]) {
              $scope.measurements.test = (GPSQueue[1] == GPSQueue[0]);
              if (GPSQueue[1] == GPSQueue[0]) {
                obj.speed = 0;
                accGPS = obj.accVel = 0 - speedGPSQueue[0];
                speedGPSQueue[0] = 0;
              }
              GPSQueue.shift();
            }

            speedQueue.push(obj.speed);
            speedList.push(obj.speed);
            accList.push(obj.accVel);

            speedSum += obj.speed;
          }

          //gravity compensation
          x_a -= gravity * (2 * (tmpQ.x * tmpQ.z - tmpQ.w * tmpQ.y));
          y_a -= gravity * (2 * (tmpQ.w * tmpQ.x + tmpQ.y * tmpQ.z));
          z_a -= gravity * (tmpQ.w * tmpQ.w - tmpQ.x * tmpQ.x - tmpQ.y * tmpQ.y + tmpQ.z * tmpQ.z);

          // accQueue.push(Math.sqrt(Math.pow(x_a, 2) + Math.pow(y_a, 2) + Math.pow(z_a, 2)));

          //calibration
          madgwick.set(madgwick.multiply(initQ));
          sensorQueue.push(madgwick.getEulerAnglesDegrees().yaw);

          //angle calculate
          if (sensorQueue[1]) {
            if ((sensorQueue[0] - sensorQueue[1]) > 300) {
              compareQueue.push((sensorQueue[0] - sensorQueue[1]) - 360 - errorRate);
            } else if ((sensorQueue[0] - sensorQueue[1]) < -300) {
              compareQueue.push((sensorQueue[0] - sensorQueue[1]) + 360 - errorRate);
            } else {
              compareQueue.push(sensorQueue[0] - sensorQueue[1] - errorRate);
            }
            sensorQueue.shift();
          }

          /*
           * angularVel_cur : 현재 각속도
           */
          angularVel_cur = compareQueue.slice(Math.round(MaxQueue * (5 / 6)), MaxQueue).reduce(function (a, b) {
            return a + b;
          });
          angularList.push(angularVel_cur.toFixed(2));

          obj.angularVel = Math.round(angularVel_cur);
          /*
           * angularVel     : 2 - 3초 사이 각도; 급진로변경 급앞지르기 당시 누적각도
           * angularVelFor5 : 1 - 5초 사이 각도; 급진로변경 급급지르기 당시 5초동안 누적각도 
           */
          // angularVel calculate
          angularVel = compareQueue.slice(Math.round(MaxQueue * (2 / 6)), Math.round(MaxQueue * (3 / 6))).reduce(function (a, b) {
            return a + b;
          });
          // angularVelFor5 calculate
          angularVelFor5 = 0;
          for(var i = 1; i<6; i++){
            angularVelFor5 += compareQueue.slice(Math.round(MaxQueue * (i / 6)), MaxQueue *((i+1) / 6)).reduce(function (a, b) {
            return a + b;
          });
          }

          // error calculate
          errorAngle3 = errorAngle6 = false;
          for (var i = 0; i <= MaxQueue - Math.round(MaxQueue / 6); i++) {
            if (Math.abs(compareQueue.slice(i, i + Math.round(MaxQueue / 6)).reduce(function (a, b) {
                return a + b;
              })) > 60)
              errorAngle6 = true;
          }
          for (var i = MaxQueue / 2; i <= MaxQueue - Math.round(MaxQueue / 6); i++) {
            if (Math.abs(compareQueue.slice(i, i + Math.round(MaxQueue / 6)).reduce(function (a, b) {
                return a + b;
              })) > 60)
              errorAngle3 = true;
          }


          // angle judgement
          sum3 = compareQueue.slice(MaxQueue / 2, MaxQueue).reduce(function (a, b) {
            return a + b;
          });
          sum6 = compareQueue.slice(0, MaxQueue).reduce(function (a, b) {
            return a + b;
          });



          // rotation judge
          // 속도가 30km/h 이상이고, 3초안에 좌/우측(누적회전각이 60˚ ~ 120˚범위)로 급회전 하는 경우
          if (cnt - judgeTime3 > MaxQueue / 2 && !errorAngle3 && obj.speed > 30) {

            if (sum3 < -60 && sum3 > -120) {
              judgeCnt3L++;
              errorList.push({
                name: '급좌회전',
                time: Date.parse(date) + (cnt - 60) * 100,
                lat: lati,
                lng: long,
                number: judgeCntSL
              });
              judgeTime3 = cnt;

              obj.rotationL = judgeCnt3L;
            }

            if (sum3 > 60 && sum3 < 120) {
              judgeCnt3R++;
              errorList.push({
                name: '급우회전',
                time: Date.parse(date) + (cnt - 60) * 100,
                lat: lati,
                lng: long,
                number: judgeCntSL
              });
              judgeTime3 = cnt;

              obj.rotationR = judgeCnt3R;
            }
          }

          // uturn judge
          // 속도가 25km/h 이상이고, 6초안에 좌/우측(누적회전각이 160˚ ~ 180˚범위)로 급회전 하는 경우
          if (cnt - judgeTime6 > MaxQueue && !errorAngle6 && obj.speed > 25) {

            if (Math.abs(sum6) > 160 && Math.abs(sum6) < 180) {
              judgeCnt6++;
              errorList.push({
                name: '급유턴',
                time: Date.parse(date) + (cnt - 60) * 100,
                lat: lati,
                lng: long,
                number: judgeCntSL
              });
              judgeTime6 = cnt;

              obj.uturn = judgeCnt6;
            }
          }

          // Acceleration judge
          // 6km/h 이상 속도에서 초당 8km/h 이상 가속 운행 하는 경우
          if (cnt - judgeTimeAcc > MaxQueue && obj.speed >= 6 && accGPS >= 8) {
            judgeCntAcc++;
            errorList.push({
              name: '급가속',
              time: Date.parse(date) + (cnt - 60) * 100,
              lat: lati,
              lng: long,
              number: judgeCntSL
            });
            judgeTimeAcc = cnt;

            obj.acc = judgeCntAcc;
          }

          // Quick start judge
          // 5km/h 이하 속도에서 초당 10km/h 이상 가속 운행 하는 경우
          if (cnt - judgeTimeStart > secondCnt * 3 && speedQueue[0] <= 5 && accGPS >= 10) {
            judgeCntStart++;
            errorList.push({
              name: '급출발',
              time: Date.parse(date) + (cnt - 60) * 100,
              lat: lati,
              lng: long,
              number: judgeCntSL
            });
            judgeTimeStart = cnt;

            obj.start = judgeCntStart;
          }

          // Deceleration judge
          // 초당 14.0km/h 이상 감속 운행하고 속도가 6.0km/h 이상인 경우
          if (cnt - judgeTimeDcc > MaxQueue && obj.speed >= 6 && accGPS <= -14) {
            judgeCntDcc++;
            errorList.push({
              name: '급감속',
              time: Date.parse(date) + (cnt - 60) * 100,
              lat: lati,
              lng: long,
              number: judgeCntSL
            });
            judgeTimeDcc = cnt;

            obj.dcc = judgeCntDcc;
          }

          // Emergency stop judge
          // 초당 14.0km/h 이상 감속하여 속도가 5.0km/h 이하가 된 경우 
          if (cnt - judgeTimeStop > secondCnt * 3 && obj.speed <= 5 && accGPS <= -14) {
            judgeCntStop++;
            errorList.push({
              name: '급정지',
              time: Date.parse(date) + (cnt - 60) * 100,
              lat: lati,
              lng: long,
              number: judgeCntSL
            });
            judgeTimeStop = cnt;

            obj.stop = judgeCntStop;
          }

          // Change course && Advance judge
          // 속도가 30km/h 이상에서 진행 방향이 좌/우측 10˚/sec 이상으로 차로변경하고, 5초동안 누적각도가 ±2˚/sec이하, 가감속이 초당 ±2km/h이하인 경우 
          // 속도가 30km/h 이상에서 진행 방향이 좌/우측 10˚/sec 이상으로 차로변경하고, 5초동안 누적각도가 ±2˚/sec이하, 가속이 초당 ±3km/h이상인 경우 
          if (cnt - judgeTimeCC > secondCnt * 5 && obj.speed >= 30 && Math.abs(angularVel) >= 10 && Math.abs(angularVelFor5) <= 2) {
            if (Math.abs(accGPS) <= 2) {
              judgeCntCC++;
              errorList.push({
                name: '급진로변경',
                time: Date.parse(date) + (cnt - 60) * 100,
                lat: lati,
                lng: long,
                number: judgeCntSL
              });
            }

            if (accGPS >= 3) {
              judgeCntCF++;
              errorList.push({
                name: '급앞지르기',
                time: Date.parse(date) + (cnt - 60) * 100,
                lat: lati,
                lng: long,
                number: judgeCntSL
              });
            }

            obj.CC = judgeCntCC;
            obj.CF = judgeCntCF;

            judgeTimeCC = cnt;

          }

          // Speeding judge
          // 도로 제한 속도보다 20km/h 이상 빠르게 운행 시
          if (cnt - judgeTimeSL > secondCnt * 3 && obj.speed >= speedLimit) {
            judgeCntSL++;
            errorList.push({
              name: '과속',
              time: Date.parse(date) + (cnt - 60) * 100,
              lat: lati,
              lng: long,
              number: judgeCntSL
            });

            judgeTimeSL = cnt;

            obj.SL = judgeCntSL;
          }

          // Long-tern Speeding judge
          // 도로 제한 속도보다 20km/h 이상 3분 이상 빠르게 운행 시
          if (obj.speed >= speedLimit) {

            CntLSL++;

            if (cnt - judgeTimeLSL > secondCnt * 3 && CntLSL >= secondCnt * 180) {
              judgeCntLSL++;
              errorList.push({
                name: '장기과속',
                time: Date.parse(date) + (cnt - 60) * 100,
                lat: lati,
                lng: long,
                number: judgeCntSL
              });
              judgeTimeLSL = cnt;

              obj.LSL = judgeCntLSL;
            }
          } else {
            CntLSL = 0;
          }

          //Data storage
          rotationAng.push(sum3.toFixed(2));
          uturnAng.push(sum6.toFixed(2));
          rotationCntL.push(judgeCnt3L);
          rotationCntR.push(judgeCnt3R);
          uturnCnt.push(judgeCnt6);
          SLCnt.push(judgeCntSL);
          LSLCnt.push(judgeCntLSL);
          AccCnt.push(judgeCntAcc);
          StartCnt.push(judgeCntStart);
          DccCnt.push(judgeCntDcc);
          StopCnt.push(judgeCntStop);
          CCCnt.push(judgeCntCC);
          CFCnt.push(judgeCntCF);
          rotationErr.push(errorAngle3);
          uturnErr.push(errorAngle6);

          RealTime.update(obj);

          compareQueue.shift();
        }
        
        $scope.measurements.speedG = obj.speed;

        if ((cnt % 10 == 0) && speedQueue[1])
          speedQueue.shift();

        if (cnt > calTime / $scope.options.frequency)
          madgwick.set(tmpQ);

        cnt++;
        console.log(cnt);
      });

    }
    mixBut.removeEventListener("click", startWatching);
    mixBut.addEventListener("click", stopWatching);
    mixBut.value = "Stop";
    mixBut.style.backgroundColor = '#f4511e';
  };
  // End Start Watching

  // Stop Watching Function
  function stopWatching() {
    compareQueue = [];
    sensorQueue = [];
    // accQueue = [];
    speedQueue = [];
    cnt = sum3 = sum6 = judgeTime3 = judgeTime6 = judgeTimeAcc = judgeTimeDcc = judgeTimeStart = judgeTimeStop = judgeTimeSL = judgeTimeLSL = 0;

    var dateEnd = new Date();
    var drivingTime = (Date.parse(dateEnd) - Date.parse(date)) / 1000;
    var averageSpeed = (speedSum / speedList.length).toFixed(2);
    var distance = (averageSpeed * (speedList.length / 3600)).toFixed(2);

    $scope.watch.clearWatch();
    $scope.watch2.clearWatch();
    navigator.geolocation.clearWatch($scope.watch3);


    Object.keys(obj).map(function (key, index) {
      obj[key] *= 0;
    });
    RealTime.update(obj);


    let logData = {
      date,
      drivingTime,
      averageSpeed,
      distance,
      rotationAng,
      uturnAng,
      rotationCntL,
      rotationCntR,
      uturnCnt,
      rotationErr,
      uturnErr,
      speedList,
      accList,
      angularList,
      SLCnt,
      LSLCnt,
      AccCnt,
      StartCnt,
      DccCnt,
      StopCnt,
      CCCnt,
      CFCnt,
      errorList,
      positionList
    }
    list.$add(logData).then(function (ref) {
      var id = ref.key();
      console.log("added record with id " + id);
      list.$indexFor(id); // returns location in the array
    });

    rotationAng = [];
    uturnAng = [];
    rotationCntL = [];
    rotationCntR = [];
    uturnCnt = [];
    rotationErr = [];
    uturnErr = [];
    speedList = [];
    accList = [];
    angularList = [];
    SLCnt = [];
    LSLCnt = [];
    AccCnt = [];
    StartCnt = [];
    DccCnt = [];
    StopCnt = [];
    CCCnt = [];
    CFCnt = [];
    errorList = [];
    positionList = [];


    mixBut.removeEventListener("click", stopWatching);
    mixBut.addEventListener("click", startWatching);
    mixBut.value = "Start";
    mixBut.style.backgroundColor = "#4CAF50";
  }
  // End Stop Watching Function

  $scope.$on('$ionicView.beforeLeave', function () {});

});

app.controller("DashCtrl", function ($scope, $ionicSideMenuDelegate, RealTime) {

  $scope.toggleLeft = function () {
    $ionicSideMenuDelegate.toggleLeft();
  };

  const voiceList = ["급출발입니다.",

    "급정지입니다.",

    "급가속입니다.",

    "급감속입니다.",

    "과속입니다.",

    "장기과속중입니다.",

    "급좌회전입니다.",

    "급우회전입니다.",

    "급유턴입니다.",

    "급진로변경입니다.",

    "급앞지르기입니다."
  ]
  const voice = function (id, voice) {
    if (id > 0) {
      TTS
        .speak({
          text: voice,
          locale: 'ko-KR',
          rate: 1
        }, function () {
          // alert('success');
        }, function (reason) {
          alert(reason);
        });
    }
  }

  // The speed gauge
  var chartSpeed = Highcharts.chart('speed', {

    chart: {
      type: 'gauge',
      plotBackgroundColor: null,
      plotBackgroundImage: null,
      plotBorderWidth: 0,
      plotShadow: false
    },

    title: {
      text: ''
    },

    pane: {
      startAngle: -150,
      endAngle: 150,
      background: [{
        backgroundColor: {
          linearGradient: {
            x1: 0,
            y1: 0,
            x2: 0,
            y2: 1
          },
          stops: [
            [0, '#FFF'],
            [1, '#333']
          ]
        },
        borderWidth: 0,
        outerRadius: '109%'
      }, {
        backgroundColor: {
          linearGradient: {
            x1: 0,
            y1: 0,
            x2: 0,
            y2: 1
          },
          stops: [
            [0, '#333'],
            [1, '#FFF']
          ]
        },
        borderWidth: 1,
        outerRadius: '107%'
      }, {
        // default background
      }, {
        backgroundColor: '#DDD',
        borderWidth: 0,
        outerRadius: '105%',
        innerRadius: '103%'
      }]
    },

    // the value axis
    yAxis: {
      min: 0,
      max: 200,

      minorTickInterval: 'auto',
      minorTickWidth: 1,
      minorTickLength: 10,
      minorTickPosition: 'inside',
      minorTickColor: '#666',

      tickPixelInterval: 30,
      tickWidth: 2,
      tickPosition: 'inside',
      tickLength: 10,
      tickColor: '#666',
      labels: {
        step: 2,
        rotation: 'auto'
      },
      title: {
        text: 'km/h'
      },
      plotBands: [{
        from: 0,
        to: 120,
        color: '#55BF3B' // green
      }, {
        from: 120,
        to: 160,
        color: '#DDDF0D' // yellow
      }, {
        from: 160,
        to: 200,
        color: '#DF5353' // red
      }]
    },

    series: [{
      name: 'Speed',
      data: [80],
      tooltip: {
        valueSuffix: ' km/h'
      }
    }]

  });

  $scope.$watch(function () {
    return RealTime.getId();
  }, function (event) {
    chartSpeed.series[0].points[0].update(RealTime.get("speed"));

    var accum = RealTime.get("rotationL") + RealTime.get("rotationR") + RealTime.get("uturn") + RealTime.get("CC") + RealTime.get("CF") + RealTime.get("SL") + RealTime.get("LSL") + RealTime.get("acc") + RealTime.get("dcc") + RealTime.get("start") + RealTime.get("stop");
    if (accum < 20) {
      $scope.color = 'green';
      $scope.text = '우수';
    } else if (accum < 40) {
      $scope.color = '#33ccff';
      $scope.text = '양호';
    } else if (accum < 60) {
      $scope.color = '#ffff00';
      $scope.text = '보통';
    } else if (accum < 80) {
      $scope.color = '#ff9900';
      $scope.text = '미달';
    } else if (accum < 100) {
      $scope.color = '#cc3300';
      $scope.text = '위험';
    } else {
      $scope.color = '#c842f4';
      $scope.text = '이상';
    }

    $scope.data = RealTime.all();

  });


  $scope.$watch(function () {
    return RealTime.get("start");
  }, function (event) {
    voice(event, voiceList[0]);
  });
  $scope.$watch(function () {
    return RealTime.get("stop");
  }, function (event) {
    voice(event, voiceList[1]);
  });
  $scope.$watch(function () {
    return RealTime.get("acc");
  }, function (event) {
    voice(event, voiceList[2]);
  });
  $scope.$watch(function () {
    return RealTime.get("dcc");
  }, function (event) {
    voice(event, voiceList[3]);
  });
  $scope.$watch(function () {
    return RealTime.get("SL");
  }, function (event) {
    voice(event, voiceList[4]);
  });
  $scope.$watch(function () {
    return RealTime.get("LSL");
  }, function (event) {
    voice(event, voiceList[5]);
  });
  $scope.$watch(function () {
    return RealTime.get("rotationL");
  }, function (event) {
    voice(event, voiceList[6]);
  });
  $scope.$watch(function () {
    return RealTime.get("rotationR");
  }, function (event) {
    voice(event, voiceList[7]);
  });

  $scope.$watch(function () {
    return RealTime.get("uturn");
  }, function (event) {
    voice(event, voiceList[8]);
  });
  $scope.$watch(function () {
    return RealTime.get("CC");
  }, function (event) {
    voice(event, voiceList[9]);
  });

  $scope.$watch(function () {
    return RealTime.get("CF");
  }, function (event) {
    voice(event, voiceList[10]);
  });

});

app.controller('graphsCtrl', function ($scope, $ionicSideMenuDelegate, RealTime) {

  $scope.toggleLeft = function () {
    $ionicSideMenuDelegate.toggleLeft();
  };

  Highcharts.setOptions({
    global: {
      useUTC: false
    }
  });

  var chartGraph = Highcharts.chart('container', {
    chart: {
      type: 'spline',
      animation: Highcharts.svg, // don't animate in old IE
      marginRight: 10,
      events: {
        load: function () {

        }
      }
    },
    title: {
      text: '속도, 가속도'
    },
    xAxis: {
      type: 'datetime',
      tickPixelInterval: 150
    },
    yAxis: {
      title: {
        text: 'km/h'
      },
      plotLines: [{
        value: 0,
        width: 1,
        color: '#808080'
      }]
    },
    tooltip: {
      formatter: function () {
        return '<b>' + this.series.name + '</b><br/>' +
          Highcharts.dateFormat('%Y-%m-%d %H:%M:%S', this.x) + '<br/>' +
          Highcharts.numberFormat(this.y, 2);
      }
    },
    legend: {
      enabled: false
    },
    exporting: {
      enabled: false
    },
    series: [{
      name: 'Speed data',
      data: (function () {
        // generate an array of random data
        var data = [],
          time = (new Date()).getTime(),
          i;

        for (i = -30; i <= 0; i += 1) {
          data.push({
            x: time + i * 1000,
            y: 0
          });
        }
        return data;
      }())
    }, {
      name: 'Acc data',
      data: (function () {
        // generate an array of random data
        var data = [],
          time = (new Date()).getTime(),
          i;

        for (i = -30; i <= 0; i += 1) {
          data.push({
            x: time + i * 1000,
            y: 0
          });
        }
        return data;
      }())
    }]
  });

  var chartGraph2 = Highcharts.chart('container2', {
    chart: {
      type: 'spline',
      animation: Highcharts.svg, // don't animate in old IE
      marginRight: 10,
      events: {
        load: function () {}
      }
    },
    title: {
      text: '각속도'
    },
    xAxis: {
      type: 'datetime',
      tickPixelInterval: 150
    },
    yAxis: {
      title: {
        text: '°/sec'
      },
      plotLines: [{
        value: 0,
        width: 1,
        color: '#808080'
      }]
    },
    tooltip: {
      formatter: function () {
        return '<b>' + this.series.name + '</b><br/>' +
          Highcharts.dateFormat('%Y-%m-%d %H:%M:%S', this.x) + '<br/>' +
          Highcharts.numberFormat(this.y, 2);
      }
    },
    legend: {
      enabled: false
    },
    exporting: {
      enabled: false
    },
    series: [{
      name: 'angular data',
      data: (function () {
        // generate an array of random data
        var data = [],
          time = (new Date()).getTime(),
          i;

        for (i = -30; i <= 0; i += 1) {
          data.push({
            x: time + i * 1000,
            y: 0
          });
        }
        return data;
      }())
    }]
  });

  var i = 0;
  $scope.$watch(function () {
    return RealTime.getId();
  }, function (event) {
    const time = (new Date()).getTime();
    if (i % 10 == 0) {
      chartGraph.series[0].addPoint([time + i * 100, RealTime.get("speed")], true, true);
      chartGraph.series[1].addPoint([time + i * 100, RealTime.get("accVel")], true, true);
      chartGraph2.series[0].addPoint([time + i * 100, RealTime.get("angularVel")], true, true);
    }
    i++;
  });

});

app.controller('recordsCtrl', function ($scope, $ionicSideMenuDelegate, $firebaseArray, Records) {

  $scope.toggleLeft = function () {
    $ionicSideMenuDelegate.toggleLeft();
  };

  var ref = firebase.database().ref("record");
  var list = $firebaseArray(ref);
  var cnt = 0;
  var keepGoing = true;
  Number.prototype.toHHMMSS = function () {
    var sec_num = parseInt(this, 10); // don't forget the second param
    var hours = Math.floor(sec_num / 3600);
    var minutes = Math.floor((sec_num - (hours * 3600)) / 60);
    var seconds = sec_num - (hours * 3600) - (minutes * 60);

    if (hours < 10) {
      hours = "0" + hours;
    }
    if (minutes < 10) {
      minutes = "0" + minutes;
    }
    if (seconds < 10) {
      seconds = "0" + seconds;
    }
    return hours + ':' + minutes + ':' + seconds;
  }

  $scope.load = function () {
    list.$loaded()
      .then(function (x) {
        // $scope.forminput = {};
        Records.clear();
        cnt = 0;

        angular.forEach(x, function (x) {
          if (keepGoing) {
            if (cnt == list.length) {
              keepGoing = false;
            }
            x.id = cnt;
            x.drivingTimeStr = x.drivingTime.toHHMMSS();
            x.dateRecord = printNow(Date.parse(x.date));
            Records.push(x);
            cnt++;
          }
        })

        $scope.items = Records.all();

        keepGoing = true;
        // Stop the ion-refresher from spinning
        $scope.$broadcast('scroll.refreshComplete');
      })
      .catch(function (error) {
        console.log("Error:", error);
      });
  }

  $scope.load();
});

app.controller('recordCtrl', function ($scope, $stateParams, Records, $firebaseArray, $cordovaGeolocation) {
  $scope.item = Records.get($stateParams.recordId);
  var ref = firebase.database().ref("record");
  var list = $firebaseArray(ref);
  var startDate = Date.parse($scope.item.date) + 32400000;
  var recordGraph = Highcharts.chart('record', {
    chart: {
      zoomType: 'xy'
    },
    title: {
      text: ''
    },
    xAxis: {
      type: 'datetime',
      labels: {
        overflow: 'justify'
      }
    },
    yAxis: {
      title: {
        text: 'km/h'
      },
      minorGridLineWidth: 0,
      gridLineWidth: 0,
      alternateGridColor: null
    },
    plotOptions: {
      spline: {
        lineWidth: 4,
        states: {
          hover: {
            lineWidth: 5
          }
        },
        marker: {
          enabled: false
        }
      }
    },
    series: [{
      name: '속도',
      type: 'column',

      pointStart: startDate,
      pointInterval: 1000, // one second
      tooltip: {
        valueSuffix: ' Km/h'
      },
      data: Records.get($stateParams.recordId).speedList.map(function (item) {
        return parseInt(item, 10);
      })
    }, {
      name: '가속도',
      tooltip: {
        valueSuffix: ' Km/h'
      },
      pointStart: startDate,

      pointInterval: 1000, // one second
      data: Records.get($stateParams.recordId).accList.map(function (item) {
        return parseInt(item, 10);
      })
    }, {
      name: '각속도',
      tooltip: {
        valueSuffix: ' °/sec'
      },
      pointStart: startDate,

      pointInterval: 100,
      data: Records.get($stateParams.recordId).angularList.map(function (item) {
        return parseInt(item, 10);
      })
    }],
    navigation: {
      menuItemStyle: {
        fontSize: '10px'
      }
    }
  });

  var labels = '1234567890';
  var markersArray = [];
  var markerClusterer;
  var items = [];
  var colors = ['red', 'blue', 'purple', 'cyan']

  // Map option, Polyline option
  var mapOption = {
    center: myLatlng,
    zoom: 10,
    mapTypeId: google.maps.MapTypeId.ROADMAP
  };
  // items = Records.get($stateParams.recordId);
  // button click
  $scope.trackerInit = function () {
    removeMarkers(null);
    removePolylines();
    // drawMarker();
  };
  console.log($scope.item.errorList);
  // Draw Map
  var lat = 35.742;
  var long = 127.421;
  var myLatlng = new google.maps.LatLng($scope.item.positionList[0].lat, $scope.item.positionList[0].lng);
  var map = new google.maps.Map(document.getElementById("map"), mapOption);
  var poly = new google.maps.Polyline();

  // Draw Map function
  function drawMarker() {
    // Set center and zoom
    map.setCenter(myLatlng);
    map.setZoom(13);

    // Draw Marker 
    // setMarkers(locations);
    // console.log("error");
    setMarkers($scope.item.errorList);

    // Draw Path
    var polyOption = {
      path: $scope.item.positionList,
      geodesic: true,
      strokeColor: 'red',
      strokeOpacity: 1.0,
      strokeWeight: 3.0,
      icons: [{ //방향을 알기 위한 화살표 표시
        icon: {
          path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW
        },
        offset: '100%',
        repeat: '150px'
      }]
    };
    poly = new google.maps.Polyline(polyOption);
    poly.setMap(map);
  };

  // removes the map on all markers in the array.
  function removeMarkers() {
    for (var i = 0; i < markersArray.length; i++) {
      markersArray[i].setMap(null);
    }
  };
  // removes the map on all Polylines.
  function removePolylines() {
    poly.setMap(null);
  }

  // sets the map on all markers in the array.
  function setMarkers(locations) {
    setMarkersArray(map, locations, markersArray);
  }

  $scope.$watch(function () {
    return Records.getId();
  }, function (event) {
    removePolylines();
    removeMarkers();
    drawMarker();
  }, true);

  $scope.removeProvider = function (id) {
    list.$remove(list.$getRecord(id.$id)).then(function () {
      Records.remove(id.id);
      location.href = "#/tab/records";
    });
  };
});

app.controller('ProfileCtrl', function ($scope, ngFB, $ionicSideMenuDelegate, errorRecords) {
  $scope.toggleLeft = function () {
    $ionicSideMenuDelegate.toggleLeft();
  };
  ngFB.api({
    path: '/me',
    params: {
      fields: 'id,name'
    }
  }).then(
    function (user) {
      $scope.user = user;
    },
    function (error) {});

  $scope.$watch(function () {
    return errorRecords.getState();
  }, function (event) {

    $scope.errorRecords = errorRecords.all();
  }, true);

  
});
