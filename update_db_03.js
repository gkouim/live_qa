const sqlite = require('sqlite3');

const db = new sqlite.Database('app.db',  () => {
    db.exec(`
    create table students (
        n_sid integer primary key autoincrement,
        t_student_name text,
        t_class text,
        t_year text
    );

    create unique index students_student on students(t_student_name, t_class, t_year);

    create table tests_students (
        v_testid text,
        n_student_id integer, 
        t_enter_code text
    );

    create unique index tests_students_student on tests_students(v_testid, n_student_id);

    create table tests_students_answers (
        v_testid text,
        n_student_id integer, 
        n_question_id integer,
        t_answer text
    );

    create index tests_students_answers_student_answers on tests_students_answers
    (v_testid, n_student_id);

    create unique index tests_students_answers_s_q_answer on tests_students_answers
    (v_testid, n_student_id, n_question_id);

    `, (err) => {
        console.log('error on creating schema:');
        console.log(err);
    })
});
