const sqlite = require('sqlite3');

const db = new sqlite.Database('app.db',  () => {
    db.exec(`
        create table questions (
            n_id INTEGER PRIMARY KEY autoincrement,
            t_question text,
            t_options text
        );

        create table tags (
            n_qid int,
            t_tag text
        );
        create index tags_tag on tags(t_tag);
    `, (err) => {
        console.log('error on creating schema:');
        console.log(err);
    })
});
