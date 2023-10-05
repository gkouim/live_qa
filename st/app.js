var testsApp = angular.module('testsApp', ['ngCookies']);

testsApp.controller('TeachersController', function TeachersController($scope, $cookies){
    const ws = io();
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
    ws.on( 'disconnect', () => {
        $scope.view = 'websocket-error';
        $scope.$applyAsync();
    });

    ws.on( 'connect', () => {
        ws.emit( "choosepart", {student:true});
    });

    ws.on( 'lessons', (msg) => {
        $scope.lessons = msg.data;
    });

    ws.on( 'question', (msg) => {
        $scope.view='question';
        $scope.question = msg.data;
        if( $cookies.get($scope.question.text)) {
            $scope.submitted = true;
            $scope.submitted_answer = $cookies.get($scope.question.text);
        } else {
            $scope.submitted = false;
            $scope.submitted_answer = "";
        }
    });

    ws.on( 'test-prepare', (msg) => {
        $scope.view = 'test-prepare';
        $scope.user_ended = false;
        $scope.test_completed = false;
    });

    ws.on( 'test-login-failed', (msg) => {
        $scope.login_error = 'αδυναμία σύνδεσης. προσπάθησε ξανά!';
    });

    ws.on( 'test-questions', (msg) => {
        $scope.test_completed = false;
        $scope.test = msg.data;
        $scope.test.forEach(q => {
            q.options = JSON.parse(q.t_options);
        });
        $scope.view = 'test-write';
    });

    ws.on( 'test-student-answers', (msg) => {
        msg.data.forEach( ans => {
        $scope.test.forEach( q => {
            if(q.n_id == ans.n_question_id) {
                q.t_selected = ans.t_answer;
            }
        });
        });
    });

    ws.on( 'test_end', (msg) => {
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
    });

    ws.onAny( () => {
        $scope.$applyAsync();
    });

    $scope.answer = function(ans) {
        $scope.submitted = true;
        $scope.submitted_answer = ans;
        $cookies.put($scope.question.text, ans);
        ws.emit( 'answer', {
            type: 'answer',
            answer: ans
        });
    };

    $scope.test_login = function () {
        $scope.test_student_name = $scope.test_student_name.trim().toUpperCase();
        $scope.login_error = '';
        if(!$scope.test_student_name) $scope.login_error = 'πληκτρολόγησε το όνομά σου';
        if(!$scope.test_enter_code) $scope.login_error = 'πληκτρολόγησε τον κωδικό σου';
        if(!$scope.test_student_name || !$scope.test_enter_code) return;
        ws.emit( 'test-login', {
            type: 'test-login',
            data: {
                student_name: $scope.test_student_name,
                enter_code: $scope.test_enter_code
            }
        });
    }

    $scope.test_select_answer = function(q,opt) {
        if($scope.test_completed) return;
        ws.emit( 'test-answer', {
            type: 'test-answer',
            data: {
                question: q.n_id,
                answer: opt
            }
        });
        q.t_selected = opt
    }

    $scope.test_completed_f = function() {
        $scope.user_ended = true;
    }
});
