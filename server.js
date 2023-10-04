var http = require('http');
var ws = require('ws');
var fs = require('fs');
var url = require('url');
var sqlite = require('sqlite3');

const db = new sqlite.Database('app.db');

getAllTags = function() {
    db.all( 'select distinct t_tag from tags', (err, rows) => {
        teacherWS.send( JSON.stringify( {
            type: 'db-all-tags',
            data: rows.map(item => item.t_tag)
        } ) );
    });
}

getQuestionsOfTag = function(q) {
    db.all('select n_id, t_question, t_options, t_img_url, t_correct from questions where n_id in( select n_qid from tags where t_tag = ?)', [q],
    (err, rows) => {
        teacherWS.send( JSON.stringify({
            type: 'db-tag-questions',
            data: rows
        }));
    });
}

getLastQuestions = function( req, res ) {
    db.all('select n_id, t_question, t_options, t_img_url, t_correct from questions order by n_id DESC limit 10', (err, rows) => {
        teacherWS.send( JSON.stringify({
            type: 'db-last-questions',
            data: rows
        }));
    });
}

getTests = function( req, res ) {
    db.all('select t.v_testid as test_id, group_concat(q.t_question, "|") as questions, group_concat(ifnull(q.t_img_url, ""), "|") as images from tests t, questions q where t.n_qid = q.n_id group by t.v_testid',
    (err, rows) => {
        teacherWS.send( JSON.stringify({
            type: 'db-tests',
            data: rows
        }));
        if( test ) {
            teacherWS.send( JSON.stringify( {
                type: 'test-running',
                data: {
                    test: test.test_id,
                    year: test.year,
                    class: test.class
                }
            }));
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

var lessons = ['Πληροφορική', 'Φυσική', 'Γυμναστική']; //TODO 

var question = null;
var counts = {};
var teacherWS = null;
var studentsWS = [];
// {year, class, test_id, questions}
var test = null;

wss_all = new ws.WebSocketServer( {server} );
//wss_teacher = new ws.WebSocketServer({ noServer: true });
//wss_student = new ws.WebSocketServer({ noServer: true });


msgFromStudent = function (message) {
    // console.log('student msg');
    msg = JSON.parse(message.data);
    if( msg.type == 'answer') {
        ans = msg.answer;
        if(counts[ans]) {
            counts[ans] = counts[ans] + 1;
        } else {
            counts[ans] = 1;
        }
        teacherWS.send( JSON.stringify({
            type: 'counts',
            data: counts
        }) );
    } else if (msg.type == 'test-login') {
        if(!test) return;
        db.get(`select n_sid from students, tests_students where n_sid=n_student_id and
                t_student_name=? and t_class=? and t_year=? and t_enter_code=? and v_testid=?`,
                [msg.data.student_name, test.class, test.year, msg.data.enter_code, test.test_id],
                (err,rows) => {
                    if(!rows) {
                        this.send( JSON.stringify({
                            type: 'test-login-failed'
                        }));
                    } else {
                        this.test = {
                            student_id: rows.n_sid
                        };
                        this.send( JSON.stringify ( {
                            type: 'test-questions',
                            data: test.questions
                        }));
                        db.all(`select n_question_id, t_answer from tests_students_answers
                            where n_student_id = ? and v_testid = ?`,
                            [this.test.student_id, test.test_id],
                            (err, rows) => {
                                this.send( JSON.stringify({
                                    type: 'test-student-answers',
                                    data: rows
                                }));
                            });
                    }
                });
    } else if (msg.type == 'test-answer') {
        if(!test || !this.test || !this.test.student_id) return;
        db.serialize( () => {
        db.run(`insert into tests_students_answers (v_testid, n_student_id, n_question_id, t_answer)
            values (?,?,?,?) on conflict do update set t_answer = excluded.t_answer`,
            [test.test_id, this.test.student_id, msg.data.question, msg.data.answer]);
        });
    }
};

msgFromTeacher = function (message) {
    // console.log('teacher msg');
    var msg = JSON.parse(message.data);
    if(msg.type=='question') {
        if(test) return;
        question = msg.data;
        studentsWS.forEach(client => {
            sendQuestionToClient(client);
        });
    } else if( msg.type=='save_to_db') {
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
    } else if (msg.type=='test_new') {
        const stmt = db.prepare("insert into tests(v_testid, n_qid) values (?,?)");
        msg.data.questions.forEach( qid => {
            stmt.run([msg.data.v_testid, qid]);
        });
        stmt.finalize();
    } else if (msg.type == 'test_delete') {
        db.run("delete from tests where v_testid = ?", [msg.data.v_testid]);
        db.run("delete from tests_students where v_testid=?", [msg.data.v_testid]);
        db.run("delete from tests_students_answers where v_testid=?", [msg.data.v_testid]);
        
    } else if( msg.type == 'test_send') {
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
            studentsWS.forEach(client => {
                client.send( JSON.stringify( {
                    type: 'test-prepare',
                    data: {
                        year: test.year,
                        class: test.class
                    }
                }));
                // sendTestToClient(client, rows);
            });
        })
    } else if (msg.type == 'tests_students_set') {
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
    } else if(msg.type == 'tests_students_get') {
        // this is the websocket !!!
        db.all(`select n_sid as n_student_id, t_student_name, t_enter_code 
        from students left outer join tests_students on n_sid = tests_students.n_student_id and v_testid=?
        where t_class=? and t_year=?`, 
        [msg.data.test, msg.data.class, msg.data.year ],
        (err,rows) => {
            this.send( JSON.stringify({
                type: 'tests_students_get_response',
                data: {
                    test: msg.data.test,
                    year: msg.data.year,
                    class: msg.data.class,
                    students: rows
                }
            }));
        });
    } else if (msg.type == 'test_end' ) {
        test_id = test.test_id;
        corrects = test.corrects;
        test = null;
        studentsWS.forEach(client => {
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
                    client.send(JSON.stringify({
                        type: 'test_end',
                        results: row,
                        corrects: corrects
                    }));
                })
                client.test = null;
            }
        })
    } else if (msg.type == 'db-all-tags-get' ) {
        getAllTags();
    } else if (msg.type == 'db-tag-questions-get') {
        getQuestionsOfTag(msg.data.tag);
    } else if (msg.type == 'db-last-questions-get') {
        getLastQuestions();
    } else if (msg.type == 'db-tests-get') {
        getTests();
    } else if (msg.type == 'question-select-answer') {
        db.run('update questions set t_correct = ? where n_id = ?',
        [msg.data.correct, msg.data.question], (err) => {
            if(!err) {
                teacherWS.send( JSON.stringify({
                    type: 'question-select-answer',
                    data: {
                        question: msg.data.question,
                        correct: msg.data.correct
                    }
                }));
            }
        });
    } else if( msg.type == 'tests_students_grades') {
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
            teacherWS.send( JSON.stringify({
                type: 'tests_students_grades_get',
                data: {
                    test: msg.data.test,
                    class: msg.data.class,
                    year: msg.data.year,
                    grades: rows
                }
            }));
        });
    }
};

wss_all.on( 'connection', function connection(_ws) {

    _ws.isAlive = true;
    _ws.on('pong', heartBeat);

    _ws.onmessage = function (message) {

        // console.log('first on message' + message.data);
        msg = JSON.parse(message.data);
        if(msg.student) {
            studentsWS.push(_ws);
            if(question && question.text) {
                sendQuestionToClient(_ws);
            } else if (test) {
                _ws.send(JSON.stringify({
                    type: 'test-prepare',
                    data: {
                        year: test.year,
                        class: test.class
                    }
                }))
            }
            _ws.onmessage = msgFromStudent;
        } else {
            if( msg.password && msg.password == 'giorgosk__') {
                _ws.send(JSON.stringify({
                    type: 'validated',
                }));
                teacherWS = _ws;
                getAllTags();
                getTests();
                if(question && question.text) {
                    _ws.send(JSON.stringify({
                        type: 'question',
                        data: question
                    }));
                    _ws.send(JSON.stringify({
                        type: 'counts',
                        data: counts
                    }));
                }
                _ws.onmessage = msgFromTeacher;
            }
        }
    }
});

function heartBeat() {
    this.isAlive = true;
}

const interval = setInterval( function ping() {
    console.log('pre check live ws: ' + studentsWS.length );
    studentsWS.forEach( (_ws, idx) => {
        if( _ws.isAlive == false ) {
            studentsWS.splice(idx, 1);
            return _ws.terminate();
        }
        _ws.isAlive = false;
        _ws.ping();
    });
    console.log('after check live ws: ' + studentsWS.length );
}, 300000);


var sendQuestionToClient = function(client) {
    if (client.readyState === ws.WebSocket.OPEN) {
        client.send( JSON.stringify(
            {
                type: 'question',
                data: question
            }
        ));
    }
}



const port = process.env.PORT || 8080;

server.listen(port);
console.log('listening to port: ' + port);
