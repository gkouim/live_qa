const sqlite = require('sqlite3');

const db = new sqlite.Database('app.db',  () => {
    db.exec(`
    alter table questions add column t_correct text;
    `, (err) => {
        console.log('error on creating schema:');
        console.log(err);
    })
});
