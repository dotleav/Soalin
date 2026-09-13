@echo off
setlocal enabledelayedexpansion

set count=1

for %%F in (*) do (
    if /I not "%%~nxF"=="%~nx0" (
        ren "%%F" "benar!count!%%~xF"
        set /a count+=1
    )
)

echo Selesai! Semua file sudah di-rename menjadi benar1, benar2, dst.
pause
