function printNow(date) {
    var today = new Date(date);
  
    var dayNames = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
    var day = dayNames[today.getDay()];
  
    var year   = today.getFullYear(),
        month  = today.getMonth() + 1,
        date   = today.getDate(),
        hour   = today.getHours(),
        minute = today.getMinutes(),
        second = today.getSeconds();
        ampm   = hour >= 12 ? 'PM' : 'AM';
  
    // 12시간제로 변경
    hour = hour % 12;
    hour = hour ? hour : 12; // the hour '0' should be '12'
  
    // 10미만인 분과 초를 2자리로 변경
    minute = minute < 10 ? '0' + minute : minute;
    second = second < 10 ? '0' + second : second;
  
    var now =  year + '년 ' + month + '월 ' + date + '일 ' + day + ' ' + hour + ':' + minute + ':' + second + ' ' + ampm;
  
    return now;
  }

  function addInfoWindow(map, marker, message) {
    var infoWindow = new google.maps.InfoWindow({
      content: message
    });
    google.maps.event.addListener(marker, 'click', function () {
      infoWindow.open(map, marker);
    });
  };

function setMarkersArray(map, item, pushArray){
  for (var index = 0; index < item.length; index++) {
    var marker = new google.maps.Marker({
      position: item[index],
      map: map
    });
    marker.setMap(map);
    pushArray.push(marker);

    var contentString = '<div id="content" style="margin-top:0px; padding-top:0px; box-shadow: none" >' + '<h4>' + item[0].name + '</h4>' + '</div>';
    addInfoWindow(map, marker, contentString);
  }

//   return pushArray;
}