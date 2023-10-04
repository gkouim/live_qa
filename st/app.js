var testsApp = angular.module('testsApp', ['ngCookies']);

testsApp.controller('TeachersController', function TeachersController($scope, $cookies){
    const ws = new WebSocket('ws://localhost:8080');
    // const ws = new WebSocket('wss://q.gkouimtzis.sites.sch.gr');


    $scope.random_img = Math.floor( Math.random() * 7 );
    $scope.submitted = false;
    $scope.submitted_answer = "";

    $scope.test = [];

    $scope.view = 'question';
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
    ws.onclose = function () {
        $scope.view = 'websocket-error';
        $scope.$applyAsync();
    }    
    ws.onopen = function() {
        ws.send( JSON.stringify({student:true}));
        // ws.send( JSON.stringify($scope.question));
    };
    ws.onmessage = function(ev) {
        var msg = JSON.parse(ev.data);
        if(msg.type == 'lessons') {
            $scope.lessons = msg.data;
        } else if(msg.type == 'question') {
            $scope.view='question';
            $scope.question = msg.data;
            if( $cookies.get($scope.question.text)) {
                $scope.submitted = true;
                $scope.submitted_answer = $cookies.get($scope.question.text);
            } else {
                $scope.submitted = false;
                $scope.submitted_answer = "";
            }
        } else if(msg.type == 'test-prepare' ) {
            $scope.view = 'test-prepare';
            $scope.user_ended = false;
            $scope.test_completed = false;
        } else if(msg.type == 'test-login-failed') {
            $scope.login_error = 'αδυναμία σύνδεσης. προσπάθησε ξανά!'
        } else if(msg.type == 'test-questions') {
            $scope.test_completed = false;
            $scope.test = msg.data;
            $scope.test.forEach(q => {
                q.options = JSON.parse(q.t_options);
            });
            $scope.view = 'test-write';
        } else if ( msg.type == 'test-student-answers' ) {
            msg.data.forEach( ans => {
                $scope.test.forEach( q => {
                    if(q.n_id == ans.n_question_id) {
                        q.t_selected = ans.t_answer;
                    }
                });
            });
        } else if (msg.type == 'test_end') {
            msg.corrects.forEach(correct => {
                $scope.test.forEach(q => {
                    if( q.n_id == correct.n_id) {
                        q.t_correct = correct.t_correct;
                    }
                });
            });
            $scope.test_completed = true;
            $scope.user_ended = true;
            $scope.completed_correct = msg.results.q_correct;
            $scope.completed_total = msg.results.q_total;
        }
        $scope.$applyAsync();
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

    $scope.test_login = function () {
        $scope.test_student_name = $scope.test_student_name.trim().toUpperCase();
        $scope.login_error = '';
        if(!$scope.test_student_name) $scope.login_error = 'πληκτρολόγησε το όνομά σου';
        if(!$scope.test_enter_code) $scope.login_error = 'πληκτρολόγησε τον κωδικό σου';
        if(!$scope.test_student_name || !$scope.test_enter_code) return;
        ws.send( JSON.stringify({
            type: 'test-login',
            data: {
                student_name: $scope.test_student_name,
                enter_code: $scope.test_enter_code
            }
        }));
    }

    $scope.test_select_answer = function(q,opt) {
        if($scope.test_completed) return;
        ws.send( JSON.stringify({
            type: 'test-answer',
            data: {
                question: q.n_id,
                answer: opt
            }
        }));
        q.t_selected = opt
    }

    $scope.test_completed_f = function() {
        $scope.user_ended = true;
    }
});
