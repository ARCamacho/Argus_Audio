import dotenv from 'dotenv';

dotenv.config();

export const API_TOKEN = process.env.ARGUS_API_TOKEN;
export const CAMPAIGN_ID = process.env.ARGUS_CAMPAIGN_ID;
export const API_BASE_URL = 'https://argus.app.br/apiargus';