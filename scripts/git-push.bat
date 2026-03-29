@echo off
setlocal enabledelayedexpansion

:: Initialize variables
set REPO_URL=
set AMEND_FLAG=

:: Loop through all parameters
for %%a in (%*) do (
    set "arg=%%a"
    
    :: Check if the argument starts with "http" or "git@"
    echo !arg! | findstr /i /b "https http git@" >nul
    if !errorlevel! equ 0 (
        set REPO_URL=!arg!
    )
    
    :: Check for the amend flag
    if /i "!arg!"=="--amend" (
        set AMEND_FLAG=true
    )
)

:: --- Execution Logic ---

:: Initial Setup (Only runs if a URL was found)
if not "!REPO_URL!"=="" (
    git init
    git branch -M main
    git remote add origin !REPO_URL!
)

:: User Identity
git config user.email "ccs.emersonb@gmail.com"
git config user.name "emerson-bacomo"
git config --global core.editor "code --wait"

:: Ensure we are on main
git branch -M main

:: Stage Changes
git add .

:: Commit Logic
if "!AMEND_FLAG!"=="true" (
    git commit --amend --no-edit
) else (
    git commit
)

:: Push Logic
if not "!REPO_URL!"=="" (
    git push -u origin main
) else (
    :: If amended, we likely need --force if the commit was already pushed
    if "!AMEND_FLAG!"=="true" (
        git push --force origin main
    ) else (
        git push origin main
    )
)

endlocal