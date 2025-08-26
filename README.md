# Argus_Audio

## **Descrição**

Este script em Node.js foi desenvolvido para automatizar o download de gravações de áudio da API Argus.


## **Pré-requisitos**

Antes de iniciar, você precisa ter instalado:
- [Node.js](https://nodejs.org/)
- [npm](https://www.npmjs.com/) ou [yarn](https://yarnpkg.com/)
- Conexão de rede para acesso às APIs externas

## **Instalação**

1. Clone o repositório:
   ```bash
   git clone https://github.com/seu_usuario/seu_repositorio.git
   cd seu_repositorio
   ```

2. Instale as dependências:
   ```bash
   npm install
   ```

## **Configuração**

1. Crie um arquivo `.env` na raiz do projeto e configure as variáveis de ambiente necessárias:
   ```
    ARGUS_API_TOKEN
   ```
   ```
    ARGUS_CAMPAIGN_ID
    ```
2. Certifique-se de que o arquivo `.env` esteja incluído no `.gitignore` para evitar o vazamento de informações sensíveis.

## **Uso**

Execute o projeto com o seguinte comando:
```bash
npm start
```

O projeto irá:
- Gerar uautenticação.
- Listar todas as campanhas.
- Listar todas as ligações.
- Consultar existencia da gravação de ligação.
- Baixar o audio em Mp3.
- Gerar logs com as informações e csv.


## **Arquitetura**

### Estrutura de Pastas
```
├── apiService.js
├── config.js
├── .env
├── index.js
└── README.md
```

## **Contribuição**

1. Faça um fork do repositório.
2. Crie uma nova branch (`git checkout -b feature/nova-feature`).
3. Faça commit das suas alterações (`git commit -m 'Adiciona nova funcionalidade'`).
4. Faça push para a branch (`git push origin feature/nova-feature`).
5. Abra um Pull Request.

