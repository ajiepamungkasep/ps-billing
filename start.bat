@echo off
title PS Billing System
echo =========================================
echo    Inisialisasi PS Billing System
echo =========================================
echo.

echo [0/5] Membunuh semua proses lama di port 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000') do taskkill /pid %%a /f >nul 2>&1
timeout /t 1 >nul
echo ✓ Port 3000 dibersihkan

echo.
echo [1/5] Membersihkan dependency lama (jika ada)...
if exist "node_modules" rmdir /s /q "node_modules"
if exist "bun.lockb" del /f /q "bun.lockb"

echo.
echo [2/5] Mendownload dan menginstall dependency dari awal...
call bun install

echo.
echo [3/5] Memulai server...
echo ✓ Server akan berjalan di http://localhost:3000
echo.
start http://localhost:3000

echo.
echo [4/5] Server dimulai...
call bun run src/index.ts

echo.
echo [5/5] Server berhenti.
pause