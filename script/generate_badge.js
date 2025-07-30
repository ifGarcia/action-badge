const fs = require('fs').promises;
const path = require('path');
const simpleGit = require('simple-git');
const { createCanvas } = require('canvas');

// Função utilitária para tentativas com delay
async function tentarComRetries(fn, maxTentativas = 3, delayMs = 2000) {
  for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
    try {
      return await fn();
    } catch (error) {
      console.warn(`      Tentativa ${tentativa} falhou: ${error.message}`);
      if (tentativa < maxTentativas) {
        await new Promise(res => setTimeout(res, delayMs));
      } else {
        throw new Error(`Todas as ${maxTentativas} tentativas falharam.`);
      }
    }
  }
}

// Função principal
const main = async () => {
  const environment = process.env.environment;
  const version = process.env.version;
  
  const TOKEN = process.env.token;
  
  const repo_badge = process.env.repo.split('/')[1];
  const owner_repo_badge = process.env.repo.split('/')[0];
  const branch_badge = process.env.branch;

  const repo_ctrl = process.env.GITHUB_REPOSITORY.split('/')[1];

  // Verificar se a versão já está presente no badge remoto
  console.log('Verificando versão atual do badge remoto...');
  const { Octokit } = await import('@octokit/rest');
  const octokit = new Octokit({ auth: TOKEN });
  
  let remoteContent = '';
  try {
    const { data } = await octokit.repos.getContent({
      owner: owner_repo_badge,
      repo: repo_badge,
      path: `badges/${repo_ctrl}/${environment}.svg`,
      ref: branch_badge
    });
  
    if (data && data.content) {
      remoteContent = Buffer.from(data.content, 'base64').toString('utf-8');
    }
  } catch (error) {
    if (error.status === 404) {
      console.log('⚠️ Badge remoto ainda não existe. Será criado.');
    } else {
      console.error(`❌ Erro ao buscar conteúdo remoto: ${error.message}`);
    }
  }
  
  // Extrair a versão atual do SVG
  let versaoAtual = null;
  if (remoteContent) {
    const match = remoteContent.match(/<tspan[^>]*>\s*([\d.]+)\s*<\/tspan>/g);
    if (match && match.length > 0) {
      const ultimaTag = match[match.length - 1];
      const versaoMatch = ultimaTag.match(/>([\d.]+)</);
      if (versaoMatch) {
        versaoAtual = versaoMatch[1];
        console.log(`✅ Versão atual encontrada no badge: ${versaoAtual}`);
      }
    }
  }
  
  // Comparar com a nova versão
  if (versaoAtual === version) {
    console.log(`⚠️ A versão "${version}" já está presente no badge. Nenhuma ação será executada.`);
    return;
  } else {
    console.log(`✅ A versão será atualizada de "${versaoAtual || 'nenhuma'}" para "${version}". Continuando com o processo...`);
  }

  // Verificar se as variáveis estão definidas
  if (!environment || !version || !TOKEN || !repo_ctrl || !branch_badge) {
    throw new Error('Uma ou mais variáveis de ambiente não estão definidas.');
  }

  console.log(`============================================================`);
  console.log(`Repository: ${repo_ctrl}`);
  console.log(`Environment: ${environment}`);
  console.log(`Version: ${version}`);

  const git = simpleGit();
  // Variavel com o caminho do 
  const repoPath = `${process.cwd()}/repo-clone`;

  // Log do diretório atual
  console.debug(`Diretório atual: ${process.cwd()}`);

  // Clonar o repositório usando o token
  console.log(`Clonando o repositório`);
  try {
    await tentarComRetries(() =>
      git.clone(`https://oauth2:${TOKEN}@github.com/${owner_repo_badge}/${repo_badge}.git`, repoPath, ['--branch', branch_badge]),
      2,
      500
    );
    console.log(`Repositório clonado para o diretório ${repoPath}.`);
  } catch (error) {
    console.error(`Erro ao clonar o repositório: ${error}`);
    return;
  }

  // Configurar identidade do autor
  console.log('Configurando identidade do autor...');
  try {
    const emailConfigResult = await git.cwd(repoPath).addConfig('user.email', 'badge@action.com');
    const nameConfigResult = await git.cwd(repoPath).addConfig('user.name', 'Badge Action');
    console.log('Identidade do autor configurada.');
  } catch (error) {
    console.error(`Erro ao configurar a identidade do autor: ${error}`);
    return;
  }

  // Configurações do badge
  const config = {
    colors: {
      workflowGradientStart: "#444D56",
      workflowGradientEnd: "#24292E",
      stateGradientStart: "#959DA5",
      stateGradientEnd: "#6A737D",
      textShadow: "#010101",
      text: "#FFFFFF"
    },
    fontFamily: "'DejaVu Sans',Verdana,Geneva,sans-serif",
    fontSize: 11
  };
  
  const measureTextWidth = (text, font) => {
    const canvas = createCanvas(200, 50);
    const context = canvas.getContext("2d");
    context.font = font;
    return context.measureText(text).width;
  };
  
  const workflowWidth = measureTextWidth(environment, `${config.fontSize}px ${config.fontFamily}`) + 28; // 14px padding on each side
  const stateWidth = measureTextWidth(version, `${config.fontSize}px ${config.fontFamily}`) + 12; // 6px padding on each side
  
  const badge = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${workflowWidth + stateWidth + 4}" height="20">
      <title>${environment} - ${version}</title>
      <defs>
        <linearGradient id="workflow-fill" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop stop-color="${config.colors.workflowGradientStart}" offset="0%"/>
          <stop stop-color="${config.colors.workflowGradientEnd}" offset="100%"/>
        </linearGradient>
        <linearGradient id="state-fill" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop stop-color="${config.colors.stateGradientStart}" offset="0%"/>
          <stop stop-color="${config.colors.stateGradientEnd}" offset="100%"/>
        </linearGradient>
      </defs>
      <g fill="none" fill-rule="evenodd">
        <g font-family="${config.fontFamily}" font-size="${config.fontSize}">
          <path id="workflow-bg" d="M0,3 C0,1.3431 1.3552,0 3,0 L${workflowWidth},0 L${workflowWidth},20 L3,20 C1.3552,20 0,18.6569 0,17 L0,3 Z" fill="url(#workflow-fill)" fill-rule="nonzero" rx="5" ry="5"/>
          <text fill="${config.colors.textShadow}" fill-opacity=".3">
            <tspan x="14" y="15" aria-hidden="true">${environment}</tspan>
          </text>
          <text fill="${config.colors.text}">
            <tspan x="14" y="14">${environment}</tspan>
          </text>
        </g>
        <g transform="translate(${workflowWidth})" font-family="${config.fontFamily}" font-size="${config.fontSize}">
          <path d="M0 0h${stateWidth}C${stateWidth + 1.103} 0 ${stateWidth + 3} 1.343 ${stateWidth + 3} 3v14c0 1.657-1.39 3-3.103 3H0V0z" id="state-bg" fill="url(#state-fill)" fill-rule="nonzero" rx="5" ry="5"/>
          <text fill="${config.colors.textShadow}" fill-opacity=".3" aria-hidden="true">
            <tspan x="6" y="15">${version}</tspan>
          </text>
          <text fill="${config.colors.text}">
            <tspan x="6" y="14">${version}</tspan>
          </text>
        </g>
      </g>
    </svg>`;

  const fileName = ` ${repoPath}/badges/${repo_ctrl}/${environment}.svg`;
  
  console.log(`File Name: ${fileName}`);

  // Certifique-se de que o diretório existe
  const dir = path.dirname(fileName);
  try {
    await fs.mkdir(dir, { recursive: true });
    console.log(`Diretorio criado: ${dir}`);
  } catch (error) {
    console.error(`Error na criação do diretorio: ${error.message}`);
    return;
  }

  try {
    await fs.writeFile(fileName, badge);
    console.log(`Badge written to file: ${fileName}`);
  } catch (error) {
    console.error(`Error writing file: ${error.message}`);
    return;
  }

  // Adiciona o arquivo ao Git
  console.log(`Adicionando ${fileName} ao Git.`);
  try {
    const addResult = await git.cwd(repoPath).add(fileName);
    console.log(`${fileName} foi adicionado ao Git.`);
  } catch (error) {
    console.error(`Erro ao adicionar o arquivo ao Git: ${error}`);
    return;
  }

  // Faz o commit
  const commitMessage = `Update badges: ${environment} - ${version}`;
  console.log(`Fazendo commit com a mensagem: "${commitMessage}"...`);
  try {
    const commitResult = await git.cwd(repoPath).commit(commitMessage);
    console.log(`Commit realizado. ${commitResult}`);
  } catch (error) {
    console.error(`Erro ao fazer o commit: ${error}`);
  }

  // Criar uma nova branch para o pull request
  const prBranch = `${repo_ctrl}-${environment}-${version}`;
  console.log(`Criando nova branch: ${prBranch}...`);
  try {
    const checkoutResult = await git.cwd(repoPath).checkoutLocalBranch(prBranch);
    console.log(`Nova branch criada: ${prBranch}`);
    // console.log(`Resultado do checkout: ${JSON.stringify(checkoutResult)}`);
  } catch (error) {
    console.error(`Erro ao criar nova branch: ${error}`);
  }

  // Subir a nova branch (push)
  console.log(`Fazendo push para ${repo_badge} na branch ${prBranch}...`);
  try {
    await tentarComRetries(() =>
      git.cwd(repoPath).push([`https://oauth2:${TOKEN}@github.com/${repo}.git`, prBranch, '--force']),
      2,
      2000
    );
    console.log(`Nova branch enviada.`);
  } catch (error) {
    console.error(`Erro ao fazer o push: ${error}`);
    return;
  }

  // Criar o pull request
  console.log(`Criando pull request...`);
  let prResult; 
  try {
    prResult = await tentarComRetries(() =>
      octokit.pulls.create({
        owner: owner_repo_badge,
        repo: repo_badge,
        title: `Update badges: ${environment} - ${version}`,
        head: prBranch,
        base: branch_badge,
        body: `Badge ambiente: ${environment} versão: ${version}.`
      }),
      5,
      2000
    );
    console.log(`Pull request criado.`);
  } catch (error) {
    console.error(`Erro ao criar o pull request: ${error}`);
    return;
  }

  // Adicionar a label 'badge' ao pull request
  const issueNumber = prResult.data.number;
  try {
    await octokit.issues.addLabels({
      owner: owner_repo_badge,
      repo: repo_badge,
      issue_number: issueNumber,
      labels: ['badge']
    });
    console.log(`Label 'badge' adicionada ao pull request.`);
  } catch (error) {
    console.error(`Erro ao adicionar a label 'badge': ${error}`);
  }

  // Adicionar a milestone 'Badges' ao pull request
  const milestones = await octokit.issues.listMilestones({
    owner: owner_repo_badge,
    repo: repo_badge
  });
  const milestone = milestones.data.find(m => m.title === 'Badges');
  if (milestone) {
    await octokit.issues.update({
      owner: owner_repo_badge,
      repo: repo_badge,
      issue_number: issueNumber,
      milestone: milestone.number
    });
    console.log(`Milestone 'Badges' adicionada ao pull request.`);
  } else {
    console.log(`Milestone 'Badges' não encontrada.`);
  }

  // Tentativas de merge com bypass das regras de proteção
  const maxAttempts = 10;
  let attempt = 0;
  let mergeSuccess = false;

  while (attempt < maxAttempts && !mergeSuccess) {
    attempt++;
    console.log(`      Tentativa ${attempt}: Atualizando a branch do pull request com as últimas mudanças da branch base...`);
    await git.cwd(repoPath).fetch('origin', branch_badge);
    await git.cwd(repoPath).mergeFromTo(branch_badge, prBranch);
    console.log(`Branch atualizada.`);

    // Fazer o merge do pull request com bypass das regras de proteção
    console.log(`      Tentativa ${attempt}: Fazendo merge do pull request...`);
    try {
      const mergeResult = await octokit.pulls.merge({
        owner: owner_repo_badge,
        repo: repo_badge,
        pull_number: issueNumber,
        merge_method: 'merge',
        bypass_rules: true // Adiciona a opção de bypass das regras de proteção
      });
      console.log(`Pull request merged.`);
      // console.log(`Resultado do merge: ${JSON.stringify(mergeResult)}`);

      // Verificar se o merge foi bem-sucedido
      if (mergeResult.status === 200) {
        mergeSuccess = true;
        console.log(`Merge realizado com sucesso na tentativa ${attempt}.`);

        // Excluir a branch local e remota via API
        console.log(`Excluindo a branch ${prBranch} via API...`);
        try {
          const deleteResult = await octokit.git.deleteRef({
            owner: owner_repo_badge,
            repo: repo_badge,
            ref: `heads/${prBranch}`
          });
          if (deleteResult.status === 204) {
            console.log(`✅ Branch ${prBranch} excluída com sucesso via API (status 204).`);
          } else {
            console.warn(`⚠️ Exclusão da branch retornou status inesperado: ${deleteResult.status}`);
          }
        } catch (error) {
          console.error(`Erro ao excluir a branch ${prBranch} via API: ${error.message}`);
        }
      } else {
        console.log(`Merge não realizado na tentativa ${attempt}.`);
      }
    } catch (mergeError) {
      console.error(`Erro ao fazer o merge na tentativa ${attempt}: ${mergeError}`);
    }
  }

  if (!mergeSuccess) {
    console.error(`Falha ao realizar o merge após ${maxAttempts} tentativas.`);
  }


  // Limpar o repositório local
  console.log('Limpando o repositório local...');
  try {
    await fs.rm(repoPath, { recursive: true, force: true });
    console.log('Repositório local limpo.');
  } catch (error) {
    console.error(`Erro ao limpar o repositório local: ${error.message}`);
  }
};

// Executa a função principal
main();
