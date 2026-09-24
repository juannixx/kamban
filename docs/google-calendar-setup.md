# Configurar a Agenda do Google no Kamban

O Kamban lê a agenda direto do seu Mac, sem servidor intermediário. Para isso ele precisa de uma credencial própria no Google Cloud. Você faz isso uma vez.

## 1. Criar o projeto
1. Entre em https://console.cloud.google.com com a sua conta pessoal (@gmail.com).
2. Crie um projeto chamado "Kamban".

## 2. Ativar a Google Calendar API
Em "APIs e serviços" > "Biblioteca", procure "Google Calendar API" e clique em "Ativar".

## 3. Tela de consentimento
1. Em "APIs e serviços" > "Tela de consentimento OAuth" (ou "Google Auth Platform"), escolha o tipo **Externo**.
2. Nome do app: Kamban. E-mail de suporte: o seu.
3. Em "Acesso a dados" (escopos), adicione:
   - `openid`
   - `.../auth/userinfo.email`
   - `https://www.googleapis.com/auth/calendar.readonly`
   - `https://www.googleapis.com/auth/calendar.freebusy`
4. Em "Público", clique em **Publicar app** para passar de "Teste" para "Produção". Não peça verificação.
   - Em "Teste", o Google expira a permissão a cada 7 dias.
   - Em "Produção" sem verificação, cada conta vê uma vez o aviso "O Google não verificou este app". Clique em "Avançado" > "Acessar Kamban (não seguro)". É o esperado para um app de uso pessoal.

## 4. Criar a credencial
1. Em "Clientes" (ou "Credenciais" > "Criar credenciais" > "ID do cliente OAuth"), escolha **App para computador**.
2. Copie o **ID do cliente** e a **chave secreta do cliente**.

## 5. Colocar a credencial no Kamban
- Para rodar no seu Mac: copie `src-tauri/.env.example` para `src-tauri/.env` e preencha `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`. Esse arquivo nunca vai para o git.
- Para o instalador do GitHub: em Settings > Secrets and variables > Actions do repositório, crie os secrets `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`.

Em apps de computador, o Google não trata essa chave secreta como confidencial: ela fica dentro do app instalado. Mesmo assim, ela não fica no código, porque o repositório é público.

## 6. Conectar as contas
Em Configurações > Agenda do Google:
- Conta pessoal: "Conectar conta" > "Com detalhes".
- Conta de trabalho (@yousalaw.com): "Conectar conta" > "Só horários, sem títulos". Nesse modo o Google só envia os horários ocupados, sem títulos nem participantes (Política YOUSA #COMP-04). Se aparecer que o administrador bloqueou o app, a TI precisa liberar o Kamban no Google Workspace.
