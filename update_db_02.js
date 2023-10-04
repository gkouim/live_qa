const sqlite = require('sqlite3');

const db = new sqlite.Database('app.db',  () => {
    db.exec(`
    create table tests (
        v_testid text,
        n_qid integer
    );

    create index tests_test on tests(v_testid);
    `, (err) => {
        console.log('error on creating schema:');
        console.log(err);
    })
});
