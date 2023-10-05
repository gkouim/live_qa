var http = require('http');
var fs = require('fs');
var url = require('url');
const {Server} = require('socket.io');

var sqlite = require('sqlite3');

const db = new sqlite.Database('app.db');


getAllTags = function() {
    db.all( 'select distinct t_tag from tags', (err, rows) => {
        teacherWS.emit( 'db-all-tags', {
            type: 'db-all-tags',
            data: rows.map(item => item.t_tag)
        } );
    });
}

getQuestionsOfTag = function(q) {
    db.all('select n_id, t_question, t_options, t_img_url, t_correct from questions where n_id in( select n_qid from tags where t_tag = ?)', [q],
    (err, rows) => {
        teacherWS.emit( 'db-tag-questions', {
            type: 'db-tag-questions',
            data: rows
        });
    });
}

getLastQuestions = function( req, res ) {
    db.all('select n_id, t_question, t_options, t_img_url, t_correct from questions order by n_id DESC limit 10', (err, rows) => {
        teacherWS.emit( 'db-last-questions', {
            type: 'db-last-questions',
            data: rows
        });
    });
}

getTests = function( req, res ) {
    db.all('select t.v_testid as test_id, group_concat(q.t_question, "|") as questions, group_concat(ifnull(q.t_img_url, ""), "|") as images from tests t, questions q where t.n_qid = q.n_id group by t.v_testid',
    (err, rows) => {
        teacherWS.emit( 'db-tests', {
            type: 'db-tests',
            data: rows
        });
        if( test ) {
            teacherWS.emit( 'test-running',  {
                type: 'test-running',
                data: {
                    test: test.test_id,
                    year: test.year,
                    class: test.class
                }
            });
        }
    });
}

getQuestions = function (req, res, q) {
    if(q.query && q.query.tag) {
        getQuestionsOfTag(req, res, q);
    } else {
        getLastQuestions(req, res);
    }
}

requestListener = function (req, res) {
    var q = url.parse(req.url, true);

    if (process.env.externalFileServer) {
        res.writeHead(404);
        return res.end("404 Not Found");
    }

    filename = "." + q.pathname;

    fs.readFile(filename, function (err, data) {
        if (err) {
            res.writeHead(404);
            return res.end("404 Not Found");
        }
        res.writeHead(200);
        res.write(data);
        return res.end();
    });
}

server = http.createServer(requestListener);

const io = new Server(server);

var lessons = ['Πληροφορική', 'Φυσική', 'Γυμναστική']; //TODO 

var question = null;
var counts = {};
var teacherWS = null;
var studentsWS = [];
// {year, class, test_id, questions}
var test = null;

const STUDENTS_ROOM = 'students';
// wss_all = new ws.WebSocketServer( {server} );
//wss_teacher = new ws.WebSocketServer({ noServer: true });
//wss_student = new ws.WebSocketServer({ noServer: true });


student_listeners = function (ws) {
    // console.log('student msg');
    ws.on('answer', (msg) => {
        ans = msg.answer;
        if(counts[ans]) {
            counts[ans] = counts[ans] + 1;
        } else {
            counts[ans] = 1;
        }
        teacherWS.emit( 'counts', {
            type: 'counts',
            data: counts
        });
    });

    ws.on('test-login', (msg) => {
        if(!test) return;
        db.get(`select n_sid from students, tests_students where n_sid=n_student_id and
                t_student_name=? and t_class=? and t_year=? and t_enter_code=? and v_testid=?`,
                [msg.data.student_name, test.class, test.year, msg.data.enter_code, test.test_id],
                (err,rows) => {
                    if(!rows) {
                        ws.emit( 'test-login-failed', {
                            type: 'test-login-failed'
                        });
                    } else {
                        ws.test = {
                            student_id: rows.n_sid
                        };
                        ws.emit( 'test-questions', {
                            type: 'test-questions',
                            data: test.questions
                        });
                        db.all(`select n_question_id, t_answer from tests_students_answers
                            where n_student_id = ? and v_testid = ?`,
                            [ws.test.student_id, test.test_id],
                            (err, rows) => {
                                ws.emit( 'test-student-answers', {
                                    type: 'test-student-answers',
                                    data: rows
                                });
                        });
                    }
                });
    });

    ws.on('test-answer', (msg) => {
        if(!test || !ws.test || !ws.test.student_id) return;
        db.serialize( () => {
        db.run(`insert into tests_students_answers (v_testid, n_student_id, n_question_id, t_answer)
            values (?,?,?,?) on conflict do update set t_answer = excluded.t_answer`,
            [test.test_id, ws.test.student_id, msg.data.question, msg.data.answer]);
        });
    });
};


teacher_listeners = function (ws) {
    // console.log('teacher msg');
    ws.on( 'question', (msg) => {
        if(test) return;
        question = msg.data;
        sendQuestionToClient(null);
    } );

    ws.on( 'save_to_db', (msg) => {
        if(!question) return;
        db.serialize( () => {
            var q_id;
            db.run('insert into questions (t_question, t_options, t_img_url) values (?,?,?)',
                [question.text, JSON.stringify(question.options), question.img_url], (err)=>err && console.log(err));
            db.get('select last_insert_rowid()', (err, row) => {
                q_id = row['last_insert_rowid()'];
                const stmt = db.prepare("insert into tags(n_qid, t_tag) values(?,?)");
                const tags = msg.data;
                tags.forEach(tag => {
                    stmt.run([q_id, tag]);
                });
                stmt.finalize();
            });
            
        });
    });

    ws.on( 'test_new', (msg) => {
        const stmt = db.prepare("insert into tests(v_testid, n_qid) values (?,?)");
        msg.data.questions.forEach( qid => {
            stmt.run([msg.data.v_testid, qid]);
        });
        stmt.finalize();
    } );

    ws.on( 'test_delete', (msg) => {
        db.run("delete from tests where v_testid = ?", [msg.data.v_testid]);
        db.run("delete from tests_students where v_testid=?", [msg.data.v_testid]);
        db.run("delete from tests_students_answers where v_testid=?", [msg.data.v_testid]);
    });

    ws.on( 'test_send', (msg) => {
        db.all('select n_id, t_question, t_options, t_img_url, t_correct from tests, questions where tests.n_qid = questions.n_id and tests.v_testid = ?' ,
        [msg.data.v_testid], (err, rows) => {
            question = null;
            test = {
                year: msg.data.year,
                class: msg.data.class,
                test_id: msg.data.v_testid,
                questions: rows.map(r => {
                    return {
                        n_id: r.n_id,
                        t_question: r.t_question,
                        t_options: r.t_options,
                        t_img_url: r.t_img_url
                    };
                }),
                corrects: rows.map( r => {
                    return {
                        n_id: r.n_id,
                        t_correct: r.t_correct
                    };
                })
            }
            io.to(STUDENTS_ROOM).emit('test-prepare', {
                type: 'test-prepare',
                data: {
                    year: test.year,
                    class: test.class
                }
            });
        })
    });

    ws.on( 'tests_students_set', (msg) => {
        data = msg.data;
        if(!data.students || !data.students.length) return;
        db.serialize( () => {
            data.students.forEach( st => {
                db.run("insert into students (t_student_name,t_class,t_year) values (?,?,?) on conflict do nothing",
                    [st.t_student_name, data.class, data.year]);
                db.get("select n_sid from students where t_student_name=? and t_class=? and t_year = ?",
                    [st.t_student_name, data.class, data.year], (err, row) => {
                        db.run("insert into tests_students(v_testid,n_student_id,t_enter_code) values(?,?,?) on conflict do update set t_enter_code=excluded.t_enter_code",
                        [data.test,row.n_sid,st.t_enter_code] );
                    });
            });
        });
    });

    ws.on( 'tests_students_get', (msg) => {
        db.all(`select n_sid as n_student_id, t_student_name, t_enter_code 
        from students left outer join tests_students on n_sid = tests_students.n_student_id and v_testid=?
        where t_class=? and t_year=?`, 
        [msg.data.test, msg.data.class, msg.data.year ],
        (err,rows) => {
            ws.emit( 'tests_students_get_response', {
                type: 'tests_students_get_response',
                data: {
                    test: msg.data.test,
                    year: msg.data.year,
                    class: msg.data.class,
                    students: rows
                }
            });
        });
    });

    ws.on( 'test_end', async (msg) => {
        test_id = test.test_id;
        corrects = test.corrects;
        test = null;
        const st_soc = await io.in(STUDENTS_ROOM).fetchSockets();
        st_soc.forEach(client => {
            if(client.test) {
                student_id = client.test.student_id;
                db.get(`SELECT ts.n_student_id,  count(*) as q_total, count(tsa.t_answer) as q_answered,
                sum( CASE WHEN tsa.t_answer = q.t_correct THEN 1 else 0 END ) as q_correct
                FROM tests_students ts, students s, tests t, questions q
                left outer join tests_students_answers tsa on tsa.v_testid=t.v_testid AND t.n_qid=tsa.n_question_id and tsa.n_student_id=s.n_sid
                WHERE ts.n_student_id = s.n_sid and t.v_testid = ts.v_testid and t.n_qid=q.n_id
                and t.v_testid = ?
                and ts.n_student_id = ?
                GROUP by ts.n_student_id
                `, [test_id, student_id], (err,row) => {
                    client.emit('test_end', {
                        type: 'test_end',
                        results: row,
                        corrects: corrects
                    });
                })
                client.test = null;
            }
        })
    });

    ws.on('db-all-tags-get', (msg) => {
        getAllTags();
    } );

    ws.on( 'db-tag-questions-get', (msg) => {
        getQuestionsOfTag(msg.data.tag);
    });

    ws.on('db-last-questions-get', (msg) => {
        getLastQuestions();
    });

    ws.on( 'db-tests-get', (msg) => {
        getTests();
    }) ;

    ws.on('question-select-answer', (msg) => {
        db.run('update questions set t_correct = ? where n_id = ?',
        [msg.data.correct, msg.data.question], (err) => {
            if(!err) {
                teacherWS.emit( 'question-select-answer', {
                    type: 'question-select-answer',
                    data: {
                        question: msg.data.question,
                        correct: msg.data.correct
                    }
                });
            }
        });
    });
    
    ws.on('tests_students_grades', (msg)=> {
        db.all(`SELECT ts.n_student_id,  s.t_student_name, count(*) as q_total, count(tsa.t_answer) as q_answered,
        sum( CASE WHEN tsa.t_answer = q.t_correct THEN 1 else 0 END ) as q_correct
        FROM tests_students ts, students s, tests t, questions q
        left outer join tests_students_answers tsa on tsa.v_testid=t.v_testid AND t.n_qid=tsa.n_question_id and tsa.n_student_id=s.n_sid
        WHERE ts.n_student_id = s.n_sid and t.v_testid = ts.v_testid and t.n_qid=q.n_id
        and t.v_testid = ?
        and s.t_class = ?
        and s.t_year = ?
        GROUP by ts.n_student_id
        `, [msg.data.test, msg.data.class, msg.data.year], (err, rows) => {
            teacherWS.emit( 'tests_students_grades_get', {
                type: 'tests_students_grades_get',
                data: {
                    test: msg.data.test,
                    class: msg.data.class,
                    year: msg.data.year,
                    grades: rows
                }
            });
        });
    });
    
};

io.on( 'connection', function connection(_ws) {

    _ws.once("choosepart", (msg) => {
        if(msg.student) {
            _ws.join(STUDENTS_ROOM);
            // studentsWS.push(_ws);
            if(question && question.text) {
                sendQuestionToClient(_ws);
            } else if (test) {
                _ws.emit( 'test-prepare', {
                    type: 'test-prepare',
                    data: {
                        year: test.year,
                        class: test.class
                    }
                });
            }
            student_listeners(_ws);
        } else {
            if( msg.password && msg.password == 'giorgosk__') {
                _ws.emit('validated', {
                    type: 'validated',
                });
                teacherWS = _ws;
                getAllTags();
                getTests();
                if(question && question.text) {
                    _ws.emit('question', {
                        type: 'question',
                        data: question
                    });
                    _ws.emit( 'counts', {
                        type: 'counts',
                        data: counts
                    });
                }
                teacher_listeners(_ws);
            }
        }
    });

});


var sendQuestionToClient = function(client) {
    if(client) {
        client.emit( 'question', {
                type: 'question',
                data: question
            });
    } else {
        io.to(STUDENTS_ROOM).emit( 'question', {
            type: 'question',
            data: question
        });
    }
}



const port = process.env.PORT || 8080;

server.listen(port);
console.log('listening to port: ' + port);
