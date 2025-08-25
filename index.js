import fs from 'fs';
import path from 'path';
import { fetchAllCampaigns, fetchAllCalls, downloadRecording } from './apiService.js';
import { CAMPAIGN_ID, API_TOKEN } from './config.js';

const START_DATE = '2025-08-08T00:00:00-03:00';
const END_DATE = '2025-08-08T23:59:59-03:00';
const DOWNLOAD_FOLDER = 'gravacoes';
const CONCURRENT_DOWNLOADS = 1;
const FAILED_LOG_FILE = 'downloads_falhos.txt';
const CURL_LOG_FILE = 'falhas_com_curl.txt';
const NOT_FOUND_LOG_FILE = 'gravacoes_nao_encontradas.txt';
const CALL_DETAILS_CSV = 'detalhes_ligacoes.csv';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const formatForApi = (date) => {
    const pad = (n) => n.toString().padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}-03:00`;
};

function splitDateRange(startDateStr, endDateStr, daysPerChunk = 7) {
    const chunks = [];
    let currentStart = new Date(startDateStr);
    const finalEnd = new Date(endDateStr);
    while (currentStart < finalEnd) {
        let currentEnd = new Date(currentStart);
        currentEnd.setDate(currentEnd.getDate() + daysPerChunk);
        let chunkEnd = (currentEnd > finalEnd) ? finalEnd : new Date(currentEnd.getTime() - 1000);
        chunks.push({ start: formatForApi(currentStart), end: formatForApi(chunkEnd) });
        currentStart = currentEnd;
    }
    return chunks;
}

function logEntry(file, message) {
    fs.appendFileSync(file, message + '\n', 'utf8');
}

function escapeCsvField(field) {
    if (field === null || field === undefined) {
        return '';
    }
    const str = String(field);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

function writeCallDetailsToCsv(filePath, callDetails, downloadStatus) {
    const row = [
        callDetails.idLigacao, callDetails.dataHoraLigacao, callDetails.idTronco, callDetails.troncoDesc,
        callDetails.nrLead, callDetails.tipoAgendaLigacao, callDetails.tipoLigacao, callDetails.idStatusLigacao,
        callDetails.resultadoLigacao, callDetails.tempoSegundos, callDetails.telefone, callDetails.idLote,
        callDetails.lote, callDetails.idSkill, callDetails.skill, callDetails.nomeCliente,
        callDetails.dataImportacao, callDetails.cpfCnpj, callDetails.codCliente, callDetails.idGrupoUsuario,
        callDetails.grupoOrigem, callDetails.idUsuario, callDetails.usuarioOperador, callDetails.idPlanPopup,
        callDetails.statusAtendimento, callDetails.tipoAgenda, callDetails.idTabulacao, callDetails.tabulacao,
        callDetails.categoriaTabulacao, callDetails.historico,
        downloadStatus
    ].map(escapeCsvField).join(',');

    fs.appendFileSync(filePath, row + '\n', 'utf8');
}


async function main() {
  const startTime = new Date();
  console.log('--- Iniciando o processo de download de gravações da Argus ---');
  
  if (fs.existsSync(FAILED_LOG_FILE)) fs.unlinkSync(FAILED_LOG_FILE);
  if (fs.existsSync(CURL_LOG_FILE)) fs.unlinkSync(CURL_LOG_FILE);
  if (fs.existsSync(NOT_FOUND_LOG_FILE)) fs.unlinkSync(NOT_FOUND_LOG_FILE);

  if (!API_TOKEN) {
    console.error('ERRO: O token da API (ARGUS_API_TOKEN) não está definido no arquivo .env.');
    return;
  }
  if (!fs.existsSync(DOWNLOAD_FOLDER)) {
    fs.mkdirSync(DOWNLOAD_FOLDER);
  }

  let campaignsToProcess = [];
  if (CAMPAIGN_ID) {
    console.log(`ID de Campanha definido: ${CAMPAIGN_ID}. Baixando apenas desta campanha.`);
    const allCampaigns = await fetchAllCampaigns();
    const targetCampaign = allCampaigns.find(c => c.id == CAMPAIGN_ID);
    if (targetCampaign) {
        campaignsToProcess.push(targetCampaign);
    } else {
        console.error(`ERRO: Campanha com ID ${CAMPAIGN_ID} não encontrada.`);
        return;
    }
  } else {
    console.log("Nenhum ID de campanha definido. Buscando todas as campanhas...");
    campaignsToProcess = await fetchAllCampaigns();
  }

  if (campaignsToProcess.length === 0) {
    console.log("Nenhuma campanha para processar. Encerrando o script.");
    return;
  }

  for (const campaign of campaignsToProcess) {
    console.log(`\n=============================================================`);
    console.log(`Processando Campanha: ${campaign.name} (ID: ${campaign.id})`);
    console.log(`=============================================================`);

    const campaignFolderName = campaign.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const campaignFolderPath = path.join(DOWNLOAD_FOLDER, campaignFolderName);
    if (!fs.existsSync(campaignFolderPath)) {
        fs.mkdirSync(campaignFolderPath);
    }
    
    const csvFilePath = path.join(campaignFolderPath, CALL_DETAILS_CSV);
    const csvHeader = [
        "idLigacao", "dataHoraLigacao", "idTronco", "troncoDesc", "nrLead", "tipoAgendaLigacao", "tipoLigacao", 
        "idStatusLigacao", "resultadoLigacao", "tempoSegundos", "telefone", "idLote", "lote", "idSkill", "skill", 
        "nomeCliente", "dataImportacao", "cpfCnpj", "codCliente", "idGrupoUsuario", "grupoOrigem", "idUsuario", 
        "usuarioOperador", "idPlanPopup", "statusAtendimento", "tipoAgenda", "idTabulacao", "tabulacao", 
        "categoriaTabulacao", "historico", "StatusDownload"
    ].join(',');
    fs.writeFileSync(csvFilePath, csvHeader + '\n', 'utf8');
    
    const dateChunks = splitDateRange(START_DATE, END_DATE, 7);
    let allCallsForCampaign = [];
    
    console.log(`A busca será dividida em ${dateChunks.length} partes de até 7 dias.`);
    for (const [index, chunk] of dateChunks.entries()) {
      console.log(`\nProcessando parte ${index + 1} de ${dateChunks.length}...`);
      const callsInChunk = await fetchAllCalls(chunk.start, chunk.end, campaign.id);
      if (callsInChunk.length > 0) {
        allCallsForCampaign = allCallsForCampaign.concat(callsInChunk);
      }
    }
    
    console.log(`\nBusca finalizada para a campanha ID ${campaign.id}. Total de ${allCallsForCampaign.length} ligações encontradas.`);
    if (allCallsForCampaign.length > 0) {
      console.log(`Iniciando o download e registro de ${allCallsForCampaign.length} gravações para a campanha "${campaign.name}"...`);
      await processDownloads(allCallsForCampaign, campaignFolderPath, campaign.id, csvFilePath);
    } else {
      console.log(`Nenhuma ligação encontrada para a campanha "${campaign.name}" no período especificado.`);
    }
  }
  
  const endTime = new Date();
  const duration = (endTime - startTime) / 1000; s
  console.log('\n--- Processo de download concluído para todas as campanhas! ---');
  console.log(`Tempo total de execução: ${duration.toFixed(2)} segundos.`);
}

async function processDownloads(calls, folderPath, campaignId, csvFilePath) {
    const queue = [...calls];
    let completed = 0;
    
    const worker = async () => {
        while(queue.length > 0) {
            const call = queue.shift();
            const fileName = `gravacao_camp${campaignId}_lig${call.idLigacao}.mp3`;
            const filePath = path.join(folderPath, fileName);
            const progress = `[${completed + 1}/${calls.length}]`;
            let downloadStatus = '';

            if (fs.existsSync(filePath)) {
                console.log(`${progress} Arquivo já existe, pulando: ${fileName}`);
                downloadStatus = 'EXISTENTE';
            } else {
                const result = await downloadRecording(campaignId, call.idLigacao);
                
                
                if (result && result.status) {
                    switch(result.status) {
                        case 'SUCCESS':
                            fs.writeFileSync(filePath, result.data);
                            console.log(`${progress} SUCESSO ao salvar: ${fileName}`);
                            downloadStatus = 'SUCESSO';
                            break;
                        case 'NOT_FOUND':
                            console.log(`${progress} ARQUIVO NÃO ENCONTRADO (Caixa Postal, etc.): ${fileName}`);
                            logEntry(NOT_FOUND_LOG_FILE, `Campanha: ${campaignId}, Ligacao: ${call.idLigacao}`);
                            downloadStatus = 'NAO_ENCONTRADO';
                            break;
                        case 'FAILED':
                            console.log(`${progress} FALHA CRÍTICA ao baixar: ${fileName}`);
                            logEntry(FAILED_LOG_FILE, `Campanha: ${campaignId}, Ligacao: ${call.idLigacao}`);
                            downloadStatus = 'FALHA';
                            break;
                    }
                } else {
                    console.log(`${progress} FALHA INESPERADA ao baixar: ${fileName}. A função de download não retornou um status.`);
                    logEntry(FAILED_LOG_FILE, `Campanha: ${campaignId}, Ligacao: ${call.idLigacao} (Retorno nulo)`);
                    downloadStatus = 'FALHA_INESPERADA';
                }
            }
            writeCallDetailsToCsv(csvFilePath, call, downloadStatus);

            completed++;
            await sleep(1000); 
        }
    };
    
    const workers = [];
    for(let i = 0; i < CONCURRENT_DOWNLOADS; i++) {
        workers.push(worker());
    }
    await Promise.all(workers);
}

main();