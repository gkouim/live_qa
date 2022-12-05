var testsApp = angular.module('testsApp', ['ngCookies']);

testsApp.controller('TeachersController', function TeachersController($scope, $cookies){
    // const ws = new WebSocket('ws://localhost:8080');
    const ws = new WebSocket('wss://q.gkouimtzis.sites.sch.gr');


    $scope.random_img = Math.floor( Math.random() * 7 );
    $scope.submitted = false;
    $scope.submitted_answer = "";
    /*
    message : {
        type: 'lessons', 'question'
        data: 
    }
    */
   /*
   question: {
        text: '',
        options: []
   }
   */
   ws.onopen = function() {
        ws.send( JSON.stringify({student:true}));
        // ws.send( JSON.stringify($scope.question));
    };
    ws.onmessage = function(ev) {
        var msg = JSON.parse(ev.data);
        if(msg.type == 'lessons') {
            $scope.lessons = msg.data;
            $scope.$applyAsync();
        } else if(msg.type == 'question') {
            $scope.question = msg.data;
            if( $cookies.get($scope.question.text)) {
                $scope.submitted = true;
                $scope.submitted_answer = $cookies.get($scope.question.text);
            } else {
                $scope.submitted = false;
                $scope.submitted_answer = "";
            }
            $scope.$applyAsync();
        }
    }

    $scope.answer = function(ans) {
        $scope.submitted = true;
        $scope.submitted_answer = ans;
        $cookies.put($scope.question.text, ans);
        ws.send(JSON.stringify({
            type: 'answer',
            answer: ans
        }));
    };
});
