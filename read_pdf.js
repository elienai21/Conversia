const fs = require('fs');
const pdf = require('pdf-parse');

let dataBuffer = fs.readFileSync('c:/Projetos/Conversia/diretriz/documentacao – API Reference - stays.net.pdf');

pdf(dataBuffer).then(function(data) {
    fs.writeFileSync('c:/Projetos/Conversia/diretriz/stays-doc.txt', data.text);
    console.log("PDF extracted to stays-doc.txt");
});
