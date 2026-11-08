@echo off
chcp 65001 >nul
pushd "%~dp0..\.."
echo ============================================================
echo  NAP DU LIEU TU chuan-bi\mau-nap-du-lieu.xlsx LEN SUPABASE
echo  Chi THEM du lieu moi, khong sua hay xoa du lieu cu.
echo ============================================================
echo.
echo [Buoc 1/2] Doc file Excel...
py -X utf8 -I data\scripts\import_nhap_lieu.py --build
if errorlevel 1 goto loi
echo.
echo [Buoc 2/2] So voi database, tao SQL va nap len Supabase...
py -X utf8 -I data\scripts\make_insert_new.py --nap
if errorlevel 3 goto khongchiakhoa
if errorlevel 1 goto loi
goto het
:khongchiakhoa
if not exist data\clean\them-moi.sql goto het
powershell -NoProfile -Command "Get-Content -Raw -Encoding utf8 data\clean\them-moi.sql | Set-Clipboard"
echo.
echo ============================================================
echo  CHUA CO CHIA KHOA DE TU NAP, nen da chep san SQL vao clipboard.
echo  Mo Supabase, vao SQL Editor, dan (Ctrl+V), bam Run.
echo.
echo  De lan sau tu nap: mo file data\scripts\.env va lam theo huong dan trong file.
echo ============================================================
goto het
:loi
echo.
echo ============================================================
echo  CO LOI - xem cac dong phia tren.
echo  Neu bao khong doc duoc file Excel: luu va dong Excel roi chay lai.
echo ============================================================
:het
echo.
popd
pause
