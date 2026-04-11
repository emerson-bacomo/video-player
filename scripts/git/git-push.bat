@echo off
setlocal enabledelayedexpansion

:: Initialize variables
set REPO_URL=
set AMEND_FLAG=

:: Loop through all parameters
echo ARGS: %*
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
    if /i "!arg!"=="amend" (
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

:: Check for staged changes
git diff --cached --quiet
set "HAS_STAGED_CHANGES=!errorlevel!"
echo HAS_STAGED_CHANGES: !HAS_STAGED_CHANGES!

:: Commit Logic
if "!AMEND_FLAG!"=="true" (
    echo Amending last commit...
    git commit --amend --no-edit
) else if !HAS_STAGED_CHANGES! neq 0 (
    if exist "%~dp0git-commit-message.txt" (
        set "MSG_SIZE=0"
        for %%I in ("%~dp0git-commit-message.txt") do set "MSG_SIZE=%%~zI"
        
        if !MSG_SIZE! gtr 0 (
            :: Save message to a temp bak file
            copy /y "%~dp0git-commit-message.txt" "%~dp0git-commit-message.txt.bak" >nul

            :: Clear the tracked file and stage it so it doesn't appear in the commit diff
            type nul > "%~dp0git-commit-message.txt"
            git add "%~dp0git-commit-message.txt"

            :: Commit using the bak copy as the message source
            git commit -F "%~dp0git-commit-message.txt.bak"
            if !errorlevel! neq 0 (
                :: Restore original message on failure
                copy /y "%~dp0git-commit-message.txt.bak" "%~dp0git-commit-message.txt" >nul
                echo Commit failed. Original message restored to git-commit-message.txt
                exit /b !errorlevel!
            )
            del /q "%~dp0git-commit-message.txt.bak" 2>nul
        ) else (
            git commit
            if !errorlevel! neq 0 exit /b !errorlevel!
        )
    ) else (
        git commit
        if !errorlevel! neq 0 exit /b !errorlevel!
    )
) else (
    echo No staged changes to commit. Checking remote status...
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

if !errorlevel! neq 0 (
    echo Push failed.
    exit /b !errorlevel!
)

endlocal