var teachersApp = angular.module('teachersApp', []);



teachersApp.controller('TeachersController',  function TeachersController($scope, $http){
    const ws = io();
    // const ws = new WebSocket('wss://q.gkouimtzis.sites.sch.gr');
    // $scope.validated = true;
    
    $scope.validated = false;
    $scope.submitted = false;
    $scope.question = {
        text: '',
        img_url: '',
        options: []
    };
    $scope.counts = {};
    $scope.tags = [];
    $scope.test = [];

    $scope.tryValidate = function() {
        ws.emit("choosepart", {
            teacher: true,
            password: $scope.password
        });
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
        ws.emit( 'question', {
            type: 'question',
            data: $scope.question
        });
        $scope.submitted = true;

        if($scope.save_to_db) {
            ws.emit( 'save_to_db', {
                type: 'save_to_db',
                data: $scope.tags
            });
        }
    }

    $scope.cancel_question = function () {
        $scope.submitted = false;
        $scope.question = {
            text: '',
            img_url: '',
            options: []
        };
        $scope.counts = {};
        $scope.tags = [];
        $scope.save_to_db = false;
        ws.emit( 'question', {
            type: 'question',
            data: $scope.question
        });
    }

    $scope.getAvailableTags = function () {
        ws.emit('db-all-tags-get', {
            type: 'db-all-tags-get'
        });
    }

    $scope.getQuestionsOfTag = function(tag) {
        ws.emit( 'db-tag-questions-get', {
            type: 'db-tag-questions-get',
            data: {
                tag: tag
            }
        });
    }

    $scope.getLastQuestions = function() {
        ws.emit( 'db-last-questions-get', {
            type: 'db-last-questions-get'
        });
    }

    $scope.selectFromAvailable = function(q) {
        $scope.submitted = true;
        
        $scope.question = {
            text: q.t_question,
            img_url: q.t_img_url,
            options: q.t_options
        };
        $scope.counts = {};
        $scope.tags = [];
        $scope.save_to_db = false;
        ws.emit( 'question',  {
            type: 'question',
            data: $scope.question
        }) ;
        $scope.view = 'new_question';
        // $scope.$applyAsync();
    }

    $scope.selectForTest = function (q) {
        for( i = 0; i < $scope.test.length; ++i ) {
            if( $scope.test[i].n_id == q.n_id ) {
                $scope.test.splice(i,1);
                return;
            }
        }
        $scope.test.push(q);
    }

    $scope.test_includes = function(q) {
        for( i = 0; i < $scope.test.length; ++i ) {
            if( $scope.test[i].n_id == q.n_id ) {
                return true;
            }
        }
        return false;
    }

    $scope.save_test = function() {
        if(!$scope.test.length) return;
        tests_ids = $scope.test.map(q=> {
            return q.n_id
        });
        ws.emit( 'test_new', {
            type: 'test_new',
            data: {
                v_testid: $scope.test_code,
                questions: tests_ids
            }
        });
    }

    $scope.get_av_tests = function (data) {
        ws.emit('db-tests-get', {
            type: 'db-tests-get'
        });
    }

    $scope.delete_test = function(t) {
        console.log(t);
        ws.emit( 'test_delete', {
            type: 'test_delete',
            data: {
                'v_testid': t.test_id
            }
        });
    };

    $scope.send_test = function(t) {
        if(!t.send_year || !t.send_class) return;
        t.send_class = t.send_class.trim().toUpperCase();
        t.send_year = t.send_year.trim().toUpperCase();
        t.sent = new Date();
        t.duration_timer = setInterval(() => {
            t.duration = new Date() - t.sent;
            $scope.$applyAsync();
        }, 1000);
        ws.emit( 'test_send', {
            type: 'test_send',
            data: {
                'v_testid': t.test_id,
                'year': t.send_year,
                'class': t.send_class
            }
        });
    }

    $scope.test_end = function(t) {
        t.sent = null;
        clearInterval(t.duration_timer);
        ws.emit( 'test_end', {
            type: 'test_end',
        });
    }

    function create_enter_code(test, st, year, cl) {
        var forcode = test + st + year + cl + Math.floor(Math.random() * 10000);;
        var totalval = 0;
        for(ch of forcode) totalval += ch.charCodeAt(0);
        return totalval.toString(16);
    }

    $scope.add_student_to_test = function (t) {
        if(!t.test_year || !t.test_class) return;
        t.test_year = t.test_year.trim();
        t.test_class = t.test_class.trim().toUpperCase();
        if(!t.test_year || !t.test_class) return;
        t.new_student = t.new_student.trim().toUpperCase();
        var newst = {
            n_student_id: 0,
            t_student_name: t.new_student,
            t_enter_code: create_enter_code(t.test_id, t.new_student, t.test_year, t.test_class),
            t_status: 'new'
        };
        if(t.students) {
            t.students.push(newst);
        } else {
            t.students = [newst];
        }
        t.new_student = '';
    };

    $scope.save_tests_students = function(t) {
        ws.emit( 'tests_students_set', {
            type: 'tests_students_set',
            data: {
                test: t.test_id,
                year: t.test_year,
                class: t.test_class,
                students: t.students
            }
        });
    };

    $scope.get_tests_students = function(t) {
        t.test_year = t.test_year.trim().toUpperCase();
        t.test_class = t.test_class.trim().toUpperCase();
        if(!t.test_year || !t.test_class) return;
        ws.emit( 'tests_students_get', {
            type: 'tests_students_get',
            data: {
                test: t.test_id,
                year: t.test_year,
                class: t.test_class
            }
        });
    }

    $scope.select_correct_f = function(q, opt) {
        ws.emit( 'question-select-answer', {
            type: 'question-select-answer',
            data: {
                question: q.n_id,
                correct: opt
            }
        });
    }

    $scope.get_students_grades = function(t) {
        t.test_year = t.test_year.trim().toUpperCase();
        t.test_class = t.test_class.trim().toUpperCase();
        if( !t.test_year || !t.test_class) return;
        ws.emit('tests_students_grades', {
            type: 'tests_students_grades',
            data: {
                test: t.test_id,
                year: t.test_year,
                class: t.test_class
            }
        });
    }

    ws.on('counts', (msg) => {
        $scope.counts = msg.data;
    });

    ws.on( 'question', (msg) => {
        $scope.question = msg.data;
        $scope.submitted = true;
    });

    ws.on( 'validated', (msg) => {
        $scope.validated = true;
    } );

    ws.on( 'tests_students_get_response', (msg) => {
        $scope.av_tests.forEach(t => {
            if( t.test_id == msg.data.test && t.test_year == msg.data.year && t.test_class==msg.data.class) {
                t.students = msg.data.students;
                t.students.forEach(st=>{
                    if(!st.t_enter_code) {
                        st.t_enter_code = create_enter_code(t.test_id, st.t_student_name, t.test_year, t.test_class);
                        st.t_status = 'new-code';
                    } else {
                        st.t_status = '';
                    }
                })
            }
        });
    })

    ws.on( 'db-all-tags', (msg) => {
        $scope.availableTags = msg.data;
    });

    ws.on( 'db-tag-questions', (msg) => {
        $scope.availableQuestions = msg.data.map( q => {
            return {
                t_question: q.t_question,
                n_id: q.n_id,
                t_options: JSON.parse(q.t_options),
                t_img_url: q.t_img_url,
                t_correct: q.t_correct
            }
        });
    });

    ws.on( 'db-last-questions', (msg) => {
        $scope.availableQuestions = msg.data.map( q => {
            return {
                t_question: q.t_question,
                n_id: q.n_id,
                t_options: JSON.parse(q.t_options),
                t_img_url: q.t_img_url,
                t_correct: q.t_correct
            }
        });
    });

    ws.on( 'db-tests', (msg) => {
        $scope.av_tests = msg.data.map( t => {
            qs = t.questions.split("|");
            is = t.images.split("|");
            return {
                test_id: t.test_id,
                questions: qs.map( (q,indx)=> {
                    return {
                        question: q,
                        image: is[indx]
                    };
                })
            }
        });
    });

    ws.on( 'test-running', (msg) => {
        $scope.av_tests.forEach(test => {
            if( test.test_id == msg.data.test ) {
                test.send_year = msg.data.year;
                test.send_class = msg.data.class;
                test.sent = new Date();
                test.duration_timer = setInterval(() => {
                    test.duration = new Date() - test.sent;
                    $scope.$applyAsync();
                }, 1000);
            }
        });
    });

    ws.on( 'question-select-answer', (msg) => {
        $scope.availableQuestions.forEach(q => {
            if(q.n_id == msg.data.question) {
                q.t_correct = msg.data.correct;
            }
        });
    })

    ws.on( 'tests_students_grades_get', (msg) => {
        $scope.av_tests.forEach( t => {
            if(t.test_id == msg.data.test && t.test_year == msg.data.year && t.test_class == msg.data.class) {
                t.grades = msg.data.grades;
            }
        });
    });

    ws.onAny(()=> {
        $scope.$applyAsync();
    });

} );

