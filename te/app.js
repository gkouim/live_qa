var teachersApp = angular.module('teachersApp', []);



teachersApp.controller('TeachersController',  function TeachersController($scope, $http){
    // const ws = new WebSocket('ws://localhost:8080');
    const ws = new WebSocket('wss://q.gkouimtzis.sites.sch.gr');

    $scope.validated = false;
    $scope.submitted = false;
    $scope.question = {
        text: '',
        options: []
    };
    $scope.counts = {};
    $scope.tags = [];

    $scope.tryValidate = function() {
        ws.send(JSON.stringify({
            teacher: true,
            password: $scope.password
        }));
    }
    
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
        ws.send( JSON.stringify( {
            type: 'question',
            data: $scope.question
        }));
        $scope.submitted = true;

        if($scope.save_to_db) {
            ws.send( JSON.stringify( {
                type: 'save_to_db',
                data: $scope.tags
            }))
        }
    }

    $scope.cancel_question = function () {
        $scope.submitted = false;
        $scope.question = {
            text: '',
            options: []
        };
        $scope.counts = {};
        $scope.tags = [];
        $scope.save_to_db = false;
        ws.send( JSON.stringify( {
            type: 'question',
            data: $scope.question
        }) );
    }

    $scope.getAvailableTags = function () {
        $http.get('/te/tags').then( (res) => {
            $scope.availableTags = res.data;
        });
    }

    $scope.getQuestionsOfTag = function(tag) {
        $http.get('/te/questions', {params:{"tag":tag}}).then( (res) => {
            $scope.availableQuestions = res.data.map( q => {
                return {
                    t_question: q.t_question,
                    n_id: q.n_id,
                    t_options: JSON.parse(q.t_options)
                }
            });
        });
    }

    $scope.getLastQuestions = function() {
        $http.get('/te/questions').then( (res) => {
            $scope.availableQuestions = res.data.map( q => {
                return {
                    t_question: q.t_question,
                    n_id: q.n_id,
                    t_options: JSON.parse(q.t_options)
                }
            });
        });
    }

    $scope.selectFromAvailable = function(q) {
        $scope.submitted = true;
        
        $scope.question = {
            text: q.t_question,
            options: q.t_options
        };
        $scope.counts = {};
        $scope.tags = [];
        $scope.save_to_db = false;
        ws.send( JSON.stringify( {
            type: 'question',
            data: $scope.question
        }) );
        $scope.view = 'new_question';
        // $scope.$applyAsync();
    }

    ws.onopen = function() {
        // ws.send( JSON.stringify({teacher:true}));
        // ws.send( JSON.stringify($scope.question));
    };

    ws.onmessage = function(ev) {
        var msg = JSON.parse(ev.data);
        if( msg.type == 'counts') {
            $scope.counts = msg.data;   
        } else if (msg.type == 'question') {
            $scope.question = msg.data;
            $scope.submitted = true;
        } else if(msg.type=='validated') {
            $scope.validated = true;
        }
        $scope.$applyAsync();
    };

    $scope.getAvailableTags();
} );

