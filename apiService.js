import axios from 'axios';
import fs from 'fs';
import { API_TOKEN, API_BASE_URL } from './config.js';

const CURL_LOG_FILE = 'falhas_com_curl.txt';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'Token-Signature': API_TOKEN
  }
});

function logCurlCommand(campaignId, callId, errorStatus) {
    const jsonData = JSON.stringify({ idCampanha: campaignId, idLigacao: callId, formato: 'MP3' });
    const curlCommand = `curl -X POST "${API_BASE_URL}/cmd/downloadgravacao" -H "Content-Type: application/json" -H "Token-Signature: ${API_TOKEN}" -d '${jsonData}'`;
    
    const logMessage = `
-----------------------------------------
Falha ao baixar a ligação ID: ${callId} (Campanha ID: ${campaignId})
Status do Erro: ${errorStatus}
Comando cURL para reproduzir o erro:
${curlCommand}
-----------------------------------------\n`;
    
    fs.appendFileSync(CURL_LOG_FILE, logMessage, 'utf8');
}


export async function fetchAllCampaigns() {
    console.log("Buscando a lista de todas as campanhas disponíveis...");
    try {
        const response = await apiClient.post('/cmd/skills', {});
        const data = response.data;
        if (data.codStatus === 1 && data.retornoGetSkillsItens) {
            const campaignsMap = new Map();
            data.retornoGetSkillsItens.forEach(skill => {
                if (!campaignsMap.has(skill.idCampanha)) {
                    campaignsMap.set(skill.idCampanha, {
                        id: skill.idCampanha,
                        name: skill.descricaoCampanha
                    });
                }
            });
            const campaigns = Array.from(campaignsMap.values());
            console.log(`Encontradas ${campaigns.length} campanhas.`);
            return campaigns;
        } else {
            console.error("Erro ao buscar campanhas:", data.descStatus);
            return [];
        }
    } catch (error) {
        console.error("Ocorreu um erro na requisição para buscar campanhas:", error.message);
        return [];
    }
}

export async function fetchAllCalls(startDate, endDate, campaignId) {
  let allCalls = [];
  let ultimoId = 0;
  let hasMorePages = true;
  console.log(`Buscando ligações de ${startDate} até ${endDate} para a campanha ID ${campaignId}...`);
  while (hasMorePages) {
    try {
      const response = await apiClient.post('/report/ligacoesdetalhadas', {
        idCampanha: campaignId,
        periodoInicial: startDate,
        periodoFinal: endDate,
        ultimoId: ultimoId
      });
      const data = response.data;
      if (data.codStatus === 1 && data.ligacoesDetalhadas && data.ligacoesDetalhadas.length > 0) {
        allCalls = allCalls.concat(data.ligacoesDetalhadas);
        console.log(` -> Encontradas ${data.qtdeRegistros} ligações nesta página. Total para este período: ${allCalls.length}`);
        ultimoId = data.idProxPagina;
        hasMorePages = !data.endOfTable && ultimoId > 0;
      } else {
        hasMorePages = false;
        if(data.codStatus !== 1) {
            console.error(' -> Erro ao buscar ligações:', data.descStatus);
        }
      }
    } catch (error) {
      console.error(' -> Ocorreu um erro na requisição para buscar ligações:', error.message);
      hasMorePages = false;
    }
  }
  return allCalls;
}

export async function downloadRecording(campaignId, callId) {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 3000; 

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await apiClient.post('/cmd/downloadgravacao', {
        idCampanha: campaignId,
        idLigacao: callId,
        formato: 'MP3'
      }, {
        responseType: 'arraybuffer'
      });
      
      if (response.headers['content-type'].includes('audio')) {
          return { status: 'SUCCESS', data: response.data };
      } else {
          const errorResponse = JSON.parse(Buffer.from(response.data).toString('utf8'));
          if (errorResponse.codStatus === -6) {
              return { status: 'NOT_FOUND' };
          }
          console.error(` -> Erro ao baixar ${callId} (tentativa ${attempt}): Resposta inesperada - ${errorResponse.descStatus}`);
          return { status: 'FAILED' };
      }
    } catch (error) {
      const status = error.response ? error.response.status : 'N/A';
      if (error.response && error.response.status >= 500 && attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY * attempt;
        console.warn(` -> Falha de servidor ao baixar ${callId} (tentativa ${attempt}) com erro ${status}. Tentando novamente em ${delay / 1000}s...`);
        await sleep(delay);
      } else {
        console.error(` -> Erro crítico ao tentar baixar a ligação ${callId} (status: ${status}) após ${attempt} tentativa(s).`);
        logCurlCommand(campaignId, callId, status);
        return { status: 'FAILED' };
      }
    }
  }

  return { status: 'FAILED' };
}