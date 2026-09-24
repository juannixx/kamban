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
   - Em "Produção" sem verificação, o aviso "O Google não verificou este app" aparece a cada conexão (o Kamban sempre pede a tela de consentimento de novo). Clique em "Avançado" > "Acessar Kamban (não seguro)". É o esperado para um app de uso pessoal.

## 4. Criar a credencial
1. Em "Clientes" (ou "Credenciais" > "Criar credenciais" > "ID do cliente OAuth"), escolha **App para computador**.
2. Copie o **ID do cliente** e a **chave secreta do cliente** na mesma hora, ou baixe o JSON da credencial. No Google Auth Platform a chave secreta só aparece (e só pode ser baixada) no momento da criação; depois disso, só criando outra.

## 5. Colocar a credencial no Kamban
- Para rodar no seu Mac: copie `src-tauri/.env.example` para `src-tauri/.env` e preencha `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`. Esse arquivo nunca vai para o git.
- Para o instalador do GitHub: em Settings > Secrets and variables > Actions do repositório, crie os secrets `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`.

Em apps de computador, o Google não trata essa chave secreta como confidencial: ela fica dentro do app instalado. Mesmo assim, ela não fica no código, porque o repositório é público.

## 6. Antes de conectar a conta de trabalho
Avise o escritório de que o Kamban vai ler a disponibilidade da sua agenda @yousalaw.com e obtenha a aprovação, conforme a Política YOUSA #COMP-04 (proteção de dados).

## 7. Conectar as contas
Em Configurações > Agenda do Google:
- Conta pessoal: "Conectar conta" > "Com detalhes".
- Conta de trabalho (@yousalaw.com): "Conectar conta" > "Só horários, sem títulos". Nesse modo o Google só envia os horários ocupados, sem títulos nem participantes (Política YOUSA #COMP-04).
- Na tela de permissões do Google, deixe marcada a permissão da agenda. Sem ela o Kamban recusa a conexão e pede para conectar de novo.

### Se o administrador bloquear o app
Em contas do Google Workspace, o Google pode mostrar uma página dizendo que o administrador bloqueou o acesso. Nesse caso o Kamban não recebe resposta e, depois de 5 minutos, avisa que o login não foi concluído.

Para liberar, envie à TI o **ID do cliente** (passo 4). A TI abre o Admin console > Segurança > Controles de API > Acesso de apps de terceiros, adiciona o app por esse ID do cliente e o marca como **Confiável**. Depois disso, conecte de novo.

## 8. Depois de instalar uma nova versão
O Kamban é assinado localmente (ad-hoc). Depois de instalar uma nova versão, o macOS pode pedir de novo acesso às Chaves (Keychain) para ler a permissão salva de cada conta. Digite a senha do Mac e clique em **Sempre permitir**.
