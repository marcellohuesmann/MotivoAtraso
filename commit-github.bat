@echo off
setlocal

rem Sempre executa a partir da pasta onde este .bat esta salvo (raiz do projeto mg).
cd /d "%~dp0"

echo ===================================================
echo   Commit e push do Multi Gerenciador para o GitHub
echo ===================================================
echo.

where git >nul 2>nul
if errorlevel 1 (
    echo ERRO: Git nao foi encontrado no PATH. Instale o Git ou ajuste o PATH e tente novamente.
    goto :end
)

git status
echo.

git diff --quiet --exit-code
set DIFF_UNSTAGED=%errorlevel%
git diff --cached --quiet --exit-code
set DIFF_STAGED=%errorlevel%
for /f %%i in ('git ls-files --others --exclude-standard') do set HAS_UNTRACKED=1

if "%DIFF_UNSTAGED%"=="0" if "%DIFF_STAGED%"=="0" if not defined HAS_UNTRACKED (
    echo Nao ha alteracoes para commitar.
    goto :end
)

set /p MSG=Mensagem do commit:
if "%MSG%"=="" (
    echo Mensagem vazia. Operacao cancelada.
    goto :end
)

git add -A
if errorlevel 1 (
    echo ERRO ao adicionar arquivos.
    goto :end
)

git commit -m "%MSG%"
if errorlevel 1 (
    echo ERRO ao criar o commit.
    goto :end
)

echo.
echo Enviando para o GitHub...
git push
if errorlevel 1 (
    echo.
    echo ERRO ao enviar para o GitHub. Verifique sua conexao, credenciais ou se o branch remoto existe.
    echo O commit local foi criado normalmente; tente "git push" manualmente depois.
    goto :end
)

echo.
echo Concluido com sucesso! Alteracoes commitadas e enviadas ao GitHub.

:end
echo.
pause
