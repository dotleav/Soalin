# convert.ps1
# GUI launcher untuk convert-docx.js
# Buka file picker -> pilih .docx -> npm install + npm run convert otomatis

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# ── Sembunyikan jendela console PowerShell ────────────────────────────────
Add-Type -Name Win32 -Namespace Console -MemberDefinition '
    [DllImport("kernel32.dll")]
    public static extern IntPtr GetConsoleWindow();
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
'
$consoleHwnd = [Console.Win32]::GetConsoleWindow()
if ($consoleHwnd -ne [IntPtr]::Zero) {
    [Console.Win32]::ShowWindow($consoleHwnd, 0) | Out-Null   # 0 = SW_HIDE
}

# ── Cari root project (folder tempat script ini ada) ─────────────────────
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

# ── Cek Node.js tersedia ──────────────────────────────────────────────────
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    [System.Windows.Forms.MessageBox]::Show(
        "Node.js tidak ditemukan. Install dulu dari https://nodejs.org",
        "Soalin — Error",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    )
    exit 1
}

# ── Buat form utama ───────────────────────────────────────────────────────
$form = New-Object System.Windows.Forms.Form
$form.Text = "Soalin — Konversi Dokumen"
$form.ClientSize = New-Object System.Drawing.Size(510, 400)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.BackColor = [System.Drawing.Color]::FromArgb(18, 18, 18)
$form.ForeColor = [System.Drawing.Color]::White

# ── Label judul ───────────────────────────────────────────────────────────
$lblTitle = New-Object System.Windows.Forms.Label
$lblTitle.Text = "Soalin Converter"
$lblTitle.Font = New-Object System.Drawing.Font("Segoe UI", 14, [System.Drawing.FontStyle]::Bold)
$lblTitle.ForeColor = [System.Drawing.Color]::FromArgb(232, 168, 56)
$lblTitle.Location = New-Object System.Drawing.Point(20, 20)
$lblTitle.Size = New-Object System.Drawing.Size(480, 30)
$form.Controls.Add($lblTitle)

$lblSub = New-Object System.Windows.Forms.Label
$lblSub.Text = "Pilih file .docx untuk dikonversi jadi questions.js"
$lblSub.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$lblSub.ForeColor = [System.Drawing.Color]::FromArgb(160, 160, 160)
$lblSub.Location = New-Object System.Drawing.Point(20, 52)
$lblSub.Size = New-Object System.Drawing.Size(480, 20)
$form.Controls.Add($lblSub)

# ── Kotak path file ───────────────────────────────────────────────────────
$txtPath = New-Object System.Windows.Forms.TextBox
$txtPath.Location = New-Object System.Drawing.Point(20, 90)
$txtPath.Size = New-Object System.Drawing.Size(370, 24)
$txtPath.Font = New-Object System.Drawing.Font("Consolas", 9)
$txtPath.BackColor = [System.Drawing.Color]::FromArgb(30, 30, 30)
$txtPath.ForeColor = [System.Drawing.Color]::White
$txtPath.BorderStyle = "FixedSingle"
$form.Controls.Add($txtPath)

# ── Simulasi placeholder (TextBox.PlaceholderText tidak ada di .NET Framework) ─
$placeholderText = "Path ke file .docx..."
$placeholderColor = [System.Drawing.Color]::FromArgb(120, 120, 120)
$normalColor = [System.Drawing.Color]::White

function Set-Placeholder {
    $txtPath.Text = $placeholderText
    $txtPath.ForeColor = $placeholderColor
}
Set-Placeholder

$txtPath.Add_Enter({
    if ($txtPath.Text -eq $placeholderText) {
        $txtPath.Text = ""
        $txtPath.ForeColor = $normalColor
    }
})
$txtPath.Add_Leave({
    if ([string]::IsNullOrWhiteSpace($txtPath.Text)) {
        Set-Placeholder
    }
})

# ── Tombol Pilih File ─────────────────────────────────────────────────────
$btnBrowse = New-Object System.Windows.Forms.Button
$btnBrowse.Text = "Pilih File"
$btnBrowse.Location = New-Object System.Drawing.Point(400, 88)
$btnBrowse.Size = New-Object System.Drawing.Size(90, 28)
$btnBrowse.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$btnBrowse.BackColor = [System.Drawing.Color]::FromArgb(45, 45, 45)
$btnBrowse.ForeColor = [System.Drawing.Color]::White
$btnBrowse.FlatStyle = "Flat"
$btnBrowse.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(80, 80, 80)
$btnBrowse.Cursor = [System.Windows.Forms.Cursors]::Hand
$btnBrowse.Add_Click({
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    $dialog.Title = "Pilih file .docx"
    $dialog.Filter = "Word Document (*.docx)|*.docx"
    $currentPath = if ($txtPath.Text -ne $placeholderText) { $txtPath.Text } else { "" }
    $dialog.InitialDirectory = if ($currentPath -and (Test-Path (Split-Path $currentPath))) {
        Split-Path $currentPath
    } else {
        [Environment]::GetFolderPath("MyDocuments")
    }
    if ($dialog.ShowDialog() -eq "OK") {
        $txtPath.Text = $dialog.FileName
        $txtPath.ForeColor = $normalColor
    }
})
$form.Controls.Add($btnBrowse)

# ── Kategori & judul paket (opsional) ─────────────────────────────────────
# Kosongkan kedua kotak ini kalau mau pakai mode lama (satu paket soal saja,
# tanpa kategori). Isi Kategori untuk membuat/menambah ke paket soal yang
# bisa dipilih dari tombol "Pilih paket soal" di app.
$lblKategori = New-Object System.Windows.Forms.Label
$lblKategori.Text = "Kategori (opsional, mis. 'Blok 2E')"
$lblKategori.Font = New-Object System.Drawing.Font("Segoe UI", 8.5)
$lblKategori.ForeColor = [System.Drawing.Color]::FromArgb(160, 160, 160)
$lblKategori.Location = New-Object System.Drawing.Point(20, 128)
$lblKategori.Size = New-Object System.Drawing.Size(230, 18)
$form.Controls.Add($lblKategori)

$txtKategori = New-Object System.Windows.Forms.TextBox
$txtKategori.Location = New-Object System.Drawing.Point(20, 148)
$txtKategori.Size = New-Object System.Drawing.Size(230, 24)
$txtKategori.Font = New-Object System.Drawing.Font("Consolas", 9)
$txtKategori.BackColor = [System.Drawing.Color]::FromArgb(30, 30, 30)
$txtKategori.ForeColor = [System.Drawing.Color]::White
$txtKategori.BorderStyle = "FixedSingle"
$form.Controls.Add($txtKategori)

$lblPaket = New-Object System.Windows.Forms.Label
$lblPaket.Text = "Nama paket (opsional)"
$lblPaket.Font = New-Object System.Drawing.Font("Segoe UI", 8.5)
$lblPaket.ForeColor = [System.Drawing.Color]::FromArgb(160, 160, 160)
$lblPaket.Location = New-Object System.Drawing.Point(260, 128)
$lblPaket.Size = New-Object System.Drawing.Size(230, 18)
$form.Controls.Add($lblPaket)

$txtPaket = New-Object System.Windows.Forms.TextBox
$txtPaket.Location = New-Object System.Drawing.Point(260, 148)
$txtPaket.Size = New-Object System.Drawing.Size(230, 24)
$txtPaket.Font = New-Object System.Drawing.Font("Consolas", 9)
$txtPaket.BackColor = [System.Drawing.Color]::FromArgb(30, 30, 30)
$txtPaket.ForeColor = [System.Drawing.Color]::White
$txtPaket.BorderStyle = "FixedSingle"
$form.Controls.Add($txtPaket)

# ── Kotak log output ──────────────────────────────────────────────────────
$txtLog = New-Object System.Windows.Forms.RichTextBox
$txtLog.Location = New-Object System.Drawing.Point(20, 182)
$txtLog.Size = New-Object System.Drawing.Size(470, 130)
$txtLog.Font = New-Object System.Drawing.Font("Consolas", 8.5)
$txtLog.BackColor = [System.Drawing.Color]::FromArgb(10, 10, 10)
$txtLog.ForeColor = [System.Drawing.Color]::FromArgb(200, 200, 200)
$txtLog.BorderStyle = "FixedSingle"
$txtLog.ReadOnly = $true
$txtLog.ScrollBars = "Vertical"
$txtLog.Text = "Siap. Pilih file .docx lalu klik Konversi."
$form.Controls.Add($txtLog)

# ── Helper: tulis ke log ──────────────────────────────────────────────────
function Write-Log {
    param([string]$msg, [string]$color = "normal")
    $txtLog.SelectionStart = $txtLog.TextLength
    $txtLog.SelectionLength = 0
    switch ($color) {
        "ok"      { $txtLog.SelectionColor = [System.Drawing.Color]::FromArgb(134, 239, 172) }
        "error"   { $txtLog.SelectionColor = [System.Drawing.Color]::FromArgb(252, 165, 165) }
        "accent"  { $txtLog.SelectionColor = [System.Drawing.Color]::FromArgb(232, 168, 56)  }
        default   { $txtLog.SelectionColor = [System.Drawing.Color]::FromArgb(200, 200, 200) }
    }
    $txtLog.AppendText("$msg`n")
    $txtLog.ScrollToCaret()
    $form.Refresh()
}

# ── Tombol Konversi ───────────────────────────────────────────────────────
$btnConvert = New-Object System.Windows.Forms.Button
$btnConvert.Text = "▶  Konversi"
$btnConvert.Location = New-Object System.Drawing.Point(20, 338)
$btnConvert.Size = New-Object System.Drawing.Size(150, 36)
$btnConvert.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$btnConvert.BackColor = [System.Drawing.Color]::FromArgb(232, 168, 56)
$btnConvert.ForeColor = [System.Drawing.Color]::FromArgb(10, 10, 10)
$btnConvert.FlatStyle = "Flat"
$btnConvert.FlatAppearance.BorderSize = 0
$btnConvert.Cursor = [System.Windows.Forms.Cursors]::Hand
$btnConvert.Add_Click({
    $docxPath = $txtPath.Text.Trim()
    if ($docxPath -eq $placeholderText) { $docxPath = "" }

    if (-not $docxPath) {
        Write-Log "⚠  Belum ada file dipilih." "error"
        return
    }
    if (-not (Test-Path $docxPath)) {
        Write-Log "⚠  File tidak ditemukan: $docxPath" "error"
        return
    }
    if ([System.IO.Path]::GetExtension($docxPath).ToLower() -ne ".docx") {
        Write-Log "⚠  Bukan file .docx." "error"
        return
    }

    $btnConvert.Enabled = $false
    $btnBrowse.Enabled = $false
    $txtLog.Clear()

    # npm install
    Write-Log "[ npm install ]" "accent"
    $installProc = Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/c npm install 2>&1" `
        -WorkingDirectory $projectRoot `
        -RedirectStandardOutput "$env:TEMP\soalin_install.txt" `
        -RedirectStandardError  "$env:TEMP\soalin_install_err.txt" `
        -NoNewWindow -Wait -PassThru

    $installOut = if (Test-Path "$env:TEMP\soalin_install.txt") { Get-Content "$env:TEMP\soalin_install.txt" -Raw } else { "" }
    if ($installOut.Trim()) { Write-Log $installOut.Trim() }

    if ($installProc.ExitCode -ne 0) {
        $errOut = if (Test-Path "$env:TEMP\soalin_install_err.txt") { Get-Content "$env:TEMP\soalin_install_err.txt" -Raw } else { "" }
        Write-Log "npm install gagal (exit $($installProc.ExitCode))." "error"
        if ($errOut.Trim()) { Write-Log $errOut.Trim() "error" }
        $btnConvert.Enabled = $true
        $btnBrowse.Enabled = $true
        return
    }
    Write-Log "npm install selesai." "ok"

    # npm run convert
    $kategori = $txtKategori.Text.Trim()
    $paket = $txtPaket.Text.Trim()
    if ($kategori) {
        Write-Log "[ npm run convert ] (kategori: $kategori)" "accent"
        $convertArgs = "/c npm run convert -- `"$docxPath`" `"$kategori`" `"$paket`" 2>&1"
    } else {
        Write-Log "[ npm run convert ] (tanpa kategori — mode lama)" "accent"
        $convertArgs = "/c npm run convert -- `"$docxPath`" 2>&1"
    }
    $convertProc = Start-Process -FilePath "cmd.exe" `
        -ArgumentList $convertArgs `
        -WorkingDirectory $projectRoot `
        -RedirectStandardOutput "$env:TEMP\soalin_convert.txt" `
        -RedirectStandardError  "$env:TEMP\soalin_convert_err.txt" `
        -NoNewWindow -Wait -PassThru

    $convertOut = if (Test-Path "$env:TEMP\soalin_convert.txt") { Get-Content "$env:TEMP\soalin_convert.txt" -Raw } else { "" }
    $convertErr = if (Test-Path "$env:TEMP\soalin_convert_err.txt") { Get-Content "$env:TEMP\soalin_convert_err.txt" -Raw } else { "" }

    if ($convertOut.Trim()) { Write-Log $convertOut.Trim() }
    if ($convertErr.Trim()) { Write-Log $convertErr.Trim() "error" }

    if ($convertProc.ExitCode -eq 0) {
        Write-Log "✓  Konversi berhasil! Buka index.html di browser." "ok"
    } else {
        Write-Log "✗  Konversi gagal (exit $($convertProc.ExitCode))." "error"
    }

    $btnConvert.Enabled = $true
    $btnBrowse.Enabled = $true
})
$form.Controls.Add($btnConvert)

# ── Run ───────────────────────────────────────────────────────────────────
$form.Add_Shown({ $form.Activate() })
[System.Windows.Forms.Application]::Run($form)
