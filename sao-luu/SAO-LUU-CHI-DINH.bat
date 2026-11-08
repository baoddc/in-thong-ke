@echo off
chcp 65001 >nul
pushd "%~dp0.."
echo ============================================================
echo  SAO LUU MOT NGAY / THANG / NAM CHI DINH
echo  (Lich 16:50 hang ngay van chay rieng, khong bi anh huong)
echo ============================================================
echo.
echo  1. Mot ngay      vi du: 05/11/2026
echo  2. Mot thang     vi du: 10/2026
echo  3. Mot nam       vi du: 2025
echo  4. Toan bo tu truoc den gio: tat ca cac nam, thang, ngay (mat khoang 4 phut)
echo.
set /p loai=Chon 1, 2, 3 hoac 4:
if "%loai%"=="4" goto toanbo
set /p gt=Nhap gia tri (theo vi du o tren):
if "%loai%"=="1" py -X utf8 sao-luu\sao_luu.py --ngay "%gt%"
if "%loai%"=="2" py -X utf8 sao-luu\sao_luu.py --thang "%gt%"
if "%loai%"=="3" py -X utf8 sao-luu\sao_luu.py --nam "%gt%"
goto het
:toanbo
py -X utf8 sao-luu\sao_luu.py --toan-bo
:het
echo.
popd
pause
