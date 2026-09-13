@echo off
setlocal enabledelayedexpansion

set count=1

for %%F in (*) do (
    if /I not "%%~nxF"=="%~nx0" (
        ren "%%F" "salah!count!%%~xF"
        set /a count+=1
    )
)

echo Selesai! Semua file sudah di-rename menjadi salah1, salah2, dst.
pause
