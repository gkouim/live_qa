var teachersApp = angular.module('teachersApp', []);



teachersApp.controller('TeachersController',  function TeachersController($scope){
    const ws = new WebSocket('ws://localhost:8080/teacher');

    $scope.submitted = false;
    $scope.question = {
        text: '',
        options: []
    };
    $scope.counts = {};
    
    $scope.add_possible_answer = function() {
        if( $scope.new_possible_answer) {
            $scope.question.options.push($scope.new_possible_answer);
            $scope.new_possible_answer = "";
        }
    }

    $scope.remove_possible_answer = function(index) {
        $scope.question.options.splice(index,1);
    }

    $scope.submit_new_question = function () {
        if(!$scope.question.text || !$scope.question.options.length) return;
        ws.send( JSON.stringify($scope.question));
        $scope.submitted = true;
    }

    $scope.cancel_question = function () {
        $scope.submitted = false;
        $scope.question = {
            text: '',
            options: []
        };
        $scope.counts = {};
        ws.send( JSON.stringify($scope.question));
    }

    ws.onopen = function() {
        
        // ws.send( JSON.stringify($scope.question));
    };

    ws.onmessage = function(ev) {
        var msg = JSON.parse(ev.data);
        if( msg.type == 'counts') {
            $scope.counts = msg.data;   
        } else if (msg.type == 'question') {
            $scope.question = msg.data;
            $scope.submitted = true;
        }
        $scope.$applyAsync();
    };
} );

