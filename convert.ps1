# convert.ps1
<<<<<<< HEAD
# Soalin — satu GUI buat konversi docx -> paket soal, kelola kategori/paket
# (ganti nama), DAN hapus paket soal. Dipanggil dari soalin.bat (satu-satunya
# launcher, buka di tab Konversi). Bisa juga dipanggil manual dan langsung
# dibuka di tab Kelola Paket:
=======
# Soalin — satu GUI buat konversi docx -> paket soal, DAN hapus paket soal.
# Dipanggil dari convert.bat (buka di tab Konversi) atau delete.bat (buka
# langsung di tab Hapus Paket). Bisa juga dipanggil manual:
>>>>>>> 9e4dc759205071e95dd37202977893e09b5df887
#   powershell -File convert.ps1 -StartTab delete

param(
    [ValidateSet("convert", "delete")]
    [string]$StartTab = "convert"
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
<<<<<<< HEAD
Add-Type -AssemblyName Microsoft.VisualBasic
=======
>>>>>>> 9e4dc759205071e95dd37202977893e09b5df887

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
$deleteScriptPath = Join-Path $projectRoot "scripts\delete-package.js"

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

# ── Warna tema ───────────────────────────────────────────────────────────
$colBg        = [System.Drawing.Color]::FromArgb(18, 18, 18)
$colPanelBg   = [System.Drawing.Color]::FromArgb(30, 30, 30)
$colLogBg     = [System.Drawing.Color]::FromArgb(10, 10, 10)
$colBorder    = [System.Drawing.Color]::FromArgb(70, 70, 70)
$colAccent    = [System.Drawing.Color]::FromArgb(232, 168, 56)
$colAccentTxt = [System.Drawing.Color]::FromArgb(10, 10, 10)
$colMuted     = [System.Drawing.Color]::FromArgb(160, 160, 160)
$colGhost     = [System.Drawing.Color]::FromArgb(250, 204, 21)
$colDanger    = [System.Drawing.Color]::FromArgb(214, 80, 70)
$colOk        = [System.Drawing.Color]::FromArgb(134, 239, 172)
$colErr       = [System.Drawing.Color]::FromArgb(252, 165, 165)
$colBtnIdle   = [System.Drawing.Color]::FromArgb(45, 45, 45)

# ── Form utama ─────────────────────────────────────────────────────────
$form = New-Object System.Windows.Forms.Form
$form.Text = "Soalin — Konverter & Kelola Paket"
$form.ClientSize = New-Object System.Drawing.Size(620, 592)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.BackColor = $colBg
$form.ForeColor = [System.Drawing.Color]::White
$form.Font = New-Object System.Drawing.Font("Segoe UI", 9)

$lblTitle = New-Object System.Windows.Forms.Label
$lblTitle.Text = "Soalin"
$lblTitle.Font = New-Object System.Drawing.Font("Segoe UI", 16, [System.Drawing.FontStyle]::Bold)
$lblTitle.ForeColor = $colAccent
$lblTitle.Location = New-Object System.Drawing.Point(24, 18)
$lblTitle.AutoSize = $true
$form.Controls.Add($lblTitle)

$lblSub = New-Object System.Windows.Forms.Label
<<<<<<< HEAD
$lblSub.Text = "Konversi dokumen .docx jadi paket soal, ganti nama kategori/paket, atau hapus yang sudah tidak dipakai."
=======
$lblSub.Text = "Konversi dokumen .docx jadi paket soal, atau hapus paket yang sudah tidak dipakai."
>>>>>>> 9e4dc759205071e95dd37202977893e09b5df887
$lblSub.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$lblSub.ForeColor = $colMuted
$lblSub.Location = New-Object System.Drawing.Point(24, 50)
$lblSub.Size = New-Object System.Drawing.Size(572, 20)
$form.Controls.Add($lblSub)

# ── "Tab" pilihan (tombol segmented, biar tetap gelap semua) ─────────────
$tabWidth = 274
$btnTabConvert = New-Object System.Windows.Forms.Button
$btnTabConvert.Text = "Konversi Dokumen"
$btnTabConvert.Location = New-Object System.Drawing.Point(24, 82)
$btnTabConvert.Size = New-Object System.Drawing.Size($tabWidth, 34)
$btnTabConvert.Font = New-Object System.Drawing.Font("Segoe UI", 9.5, [System.Drawing.FontStyle]::Bold)
$btnTabConvert.FlatStyle = "Flat"
$btnTabConvert.FlatAppearance.BorderSize = 0
$btnTabConvert.Cursor = [System.Windows.Forms.Cursors]::Hand
$form.Controls.Add($btnTabConvert)

$btnTabDelete = New-Object System.Windows.Forms.Button
<<<<<<< HEAD
$btnTabDelete.Text = "Kelola Paket"
=======
$btnTabDelete.Text = "Hapus Paket"
>>>>>>> 9e4dc759205071e95dd37202977893e09b5df887
$btnTabDelete.Location = New-Object System.Drawing.Point((24 + $tabWidth + 8), 82)
$btnTabDelete.Size = New-Object System.Drawing.Size($tabWidth, 34)
$btnTabDelete.Font = New-Object System.Drawing.Font("Segoe UI", 9.5, [System.Drawing.FontStyle]::Bold)
$btnTabDelete.FlatStyle = "Flat"
$btnTabDelete.FlatAppearance.BorderSize = 0
$btnTabDelete.Cursor = [System.Windows.Forms.Cursors]::Hand
$form.Controls.Add($btnTabDelete)

# ── Panel isi masing-masing "tab" (posisi sama, gantian yg keliatan) ─────
$panelY = 128
$panelHeight = 296
$panelWidth = 572

$panelConvert = New-Object System.Windows.Forms.Panel
$panelConvert.Location = New-Object System.Drawing.Point(24, $panelY)
$panelConvert.Size = New-Object System.Drawing.Size($panelWidth, $panelHeight)
$panelConvert.BackColor = $colBg
$form.Controls.Add($panelConvert)

$panelDelete = New-Object System.Windows.Forms.Panel
$panelDelete.Location = New-Object System.Drawing.Point(24, $panelY)
$panelDelete.Size = New-Object System.Drawing.Size($panelWidth, $panelHeight)
$panelDelete.BackColor = $colBg
$form.Controls.Add($panelDelete)

# ── Log bersama (dipakai kedua tab) ───────────────────────────────────────
$txtLog = New-Object System.Windows.Forms.RichTextBox
$txtLog.Location = New-Object System.Drawing.Point(24, ($panelY + $panelHeight + 16))
$txtLog.Size = New-Object System.Drawing.Size($panelWidth, 100)
$txtLog.Font = New-Object System.Drawing.Font("Consolas", 8.5)
$txtLog.BackColor = $colLogBg
$txtLog.ForeColor = [System.Drawing.Color]::FromArgb(200, 200, 200)
$txtLog.BorderStyle = "FixedSingle"
$txtLog.ReadOnly = $true
$txtLog.ScrollBars = "Vertical"
$txtLog.Text = "Siap."
$form.Controls.Add($txtLog)

function Write-Log {
    param([string]$msg, [string]$color = "normal")
    $txtLog.SelectionStart = $txtLog.TextLength
    $txtLog.SelectionLength = 0
    switch ($color) {
        "ok"      { $txtLog.SelectionColor = $colOk }
        "error"   { $txtLog.SelectionColor = $colErr }
        "accent"  { $txtLog.SelectionColor = $colAccent }
        "ghost"   { $txtLog.SelectionColor = $colGhost }
        default   { $txtLog.SelectionColor = [System.Drawing.Color]::FromArgb(200, 200, 200) }
    }
    $txtLog.AppendText("$msg`n")
    $txtLog.ScrollToCaret()
    $form.Refresh()
}

# ── Switch tab ─────────────────────────────────────────────────────────
function Set-ActiveTab {
    param([string]$tab)
    if ($tab -eq "convert") {
        $panelConvert.Visible = $true
        $panelDelete.Visible = $false
        $btnTabConvert.BackColor = $colAccent
        $btnTabConvert.ForeColor = $colAccentTxt
        $btnTabDelete.BackColor = $colBtnIdle
        $btnTabDelete.ForeColor = [System.Drawing.Color]::White
<<<<<<< HEAD
        Load-Categories
=======
>>>>>>> 9e4dc759205071e95dd37202977893e09b5df887
    } else {
        $panelDelete.Visible = $true
        $panelConvert.Visible = $false
        $btnTabDelete.BackColor = $colAccent
        $btnTabDelete.ForeColor = $colAccentTxt
        $btnTabConvert.BackColor = $colBtnIdle
        $btnTabConvert.ForeColor = [System.Drawing.Color]::White
        Load-Tree
<<<<<<< HEAD
        Load-Categories
=======
>>>>>>> 9e4dc759205071e95dd37202977893e09b5df887
    }
}
$btnTabConvert.Add_Click({ Set-ActiveTab "convert" })
$btnTabDelete.Add_Click({ Set-ActiveTab "delete" })

# ══════════════════════════════════════════════════════════════════════
#  TAB 1 - KONVERSI
# ══════════════════════════════════════════════════════════════════════

$lblPath = New-Object System.Windows.Forms.Label
$lblPath.Text = "File .docx"
$lblPath.Font = New-Object System.Drawing.Font("Segoe UI", 8.5)
$lblPath.ForeColor = $colMuted
$lblPath.Location = New-Object System.Drawing.Point(0, 0)
$lblPath.AutoSize = $true
$panelConvert.Controls.Add($lblPath)

$txtPath = New-Object System.Windows.Forms.TextBox
$txtPath.Location = New-Object System.Drawing.Point(0, 20)
$txtPath.Size = New-Object System.Drawing.Size(462, 24)
$txtPath.Font = New-Object System.Drawing.Font("Consolas", 9)
$txtPath.BackColor = $colPanelBg
$txtPath.ForeColor = [System.Drawing.Color]::White
$txtPath.BorderStyle = "FixedSingle"
$panelConvert.Controls.Add($txtPath)

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
    if ([string]::IsNullOrWhiteSpace($txtPath.Text)) { Set-Placeholder }
})

$btnBrowse = New-Object System.Windows.Forms.Button
$btnBrowse.Text = "Pilih File"
$btnBrowse.Location = New-Object System.Drawing.Point(472, 19)
$btnBrowse.Size = New-Object System.Drawing.Size(100, 26)
$btnBrowse.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$btnBrowse.BackColor = $colBtnIdle
$btnBrowse.ForeColor = [System.Drawing.Color]::White
$btnBrowse.FlatStyle = "Flat"
$btnBrowse.FlatAppearance.BorderColor = $colBorder
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
$panelConvert.Controls.Add($btnBrowse)

$lblKategori = New-Object System.Windows.Forms.Label
<<<<<<< HEAD
$lblKategori.Text = "Kategori (opsional, pilih yang sudah ada / ketik baru)"
=======
$lblKategori.Text = "Kategori (opsional, mis. 'Blok 2E')"
>>>>>>> 9e4dc759205071e95dd37202977893e09b5df887
$lblKategori.Font = New-Object System.Drawing.Font("Segoe UI", 8.5)
$lblKategori.ForeColor = $colMuted
$lblKategori.Location = New-Object System.Drawing.Point(0, 60)
$lblKategori.AutoSize = $true
$panelConvert.Controls.Add($lblKategori)

<<<<<<< HEAD
# ComboBox biar kategori yang sudah ada bisa dipilih langsung (bukan ketik
# ulang) — mencegah paket ke-split ke kategori baru cuma gara-gara beda
# huruf besar/kecil atau typo. Tetap bisa ketik kategori baru kalau memang
# belum ada di daftar; AutoComplete bantu nyaring ke yang sudah ada dulu.
$cmbKategori = New-Object System.Windows.Forms.ComboBox
$cmbKategori.Location = New-Object System.Drawing.Point(0, 80)
$cmbKategori.Size = New-Object System.Drawing.Size(272, 24)
$cmbKategori.Font = New-Object System.Drawing.Font("Consolas", 9)
$cmbKategori.BackColor = $colPanelBg
$cmbKategori.ForeColor = [System.Drawing.Color]::White
$cmbKategori.FlatStyle = "Flat"
$cmbKategori.DropDownStyle = "DropDown"
$cmbKategori.AutoCompleteMode = "SuggestAppend"
$cmbKategori.AutoCompleteSource = "ListItems"
$panelConvert.Controls.Add($cmbKategori)
=======
$txtKategori = New-Object System.Windows.Forms.TextBox
$txtKategori.Location = New-Object System.Drawing.Point(0, 80)
$txtKategori.Size = New-Object System.Drawing.Size(272, 24)
$txtKategori.Font = New-Object System.Drawing.Font("Consolas", 9)
$txtKategori.BackColor = $colPanelBg
$txtKategori.ForeColor = [System.Drawing.Color]::White
$txtKategori.BorderStyle = "FixedSingle"
$panelConvert.Controls.Add($txtKategori)
>>>>>>> 9e4dc759205071e95dd37202977893e09b5df887

$lblPaket = New-Object System.Windows.Forms.Label
$lblPaket.Text = "Nama paket (opsional)"
$lblPaket.Font = New-Object System.Drawing.Font("Segoe UI", 8.5)
$lblPaket.ForeColor = $colMuted
$lblPaket.Location = New-Object System.Drawing.Point(300, 60)
$lblPaket.AutoSize = $true
$panelConvert.Controls.Add($lblPaket)

$txtPaket = New-Object System.Windows.Forms.TextBox
$txtPaket.Location = New-Object System.Drawing.Point(300, 80)
$txtPaket.Size = New-Object System.Drawing.Size(272, 24)
$txtPaket.Font = New-Object System.Drawing.Font("Consolas", 9)
$txtPaket.BackColor = $colPanelBg
$txtPaket.ForeColor = [System.Drawing.Color]::White
$txtPaket.BorderStyle = "FixedSingle"
$panelConvert.Controls.Add($txtPaket)

$lblHint = New-Object System.Windows.Forms.Label
$lblHint.Text = "Kosongkan Kategori kalau cuma mau mode lama (satu paket, tanpa kategori)."
<<<<<<< HEAD

=======
>>>>>>> 9e4dc759205071e95dd37202977893e09b5df887
$lblHint.Font = New-Object System.Drawing.Font("Segoe UI", 8)
$lblHint.ForeColor = $colMuted
$lblHint.Location = New-Object System.Drawing.Point(0, 112)
$lblHint.Size = New-Object System.Drawing.Size(560, 18)
$panelConvert.Controls.Add($lblHint)

$btnConvert = New-Object System.Windows.Forms.Button
$btnConvert.Text = "$([char]0x25B6)  Konversi"
$btnConvert.Location = New-Object System.Drawing.Point(0, 246)
$btnConvert.Size = New-Object System.Drawing.Size(180, 40)
$btnConvert.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$btnConvert.BackColor = $colAccent
$btnConvert.ForeColor = $colAccentTxt
$btnConvert.FlatStyle = "Flat"
$btnConvert.FlatAppearance.BorderSize = 0
$btnConvert.Cursor = [System.Windows.Forms.Cursors]::Hand
$panelConvert.Controls.Add($btnConvert)

$btnConvert.Add_Click({
    $docxPath = $txtPath.Text.Trim()
    if ($docxPath -eq $placeholderText) { $docxPath = "" }

    if (-not $docxPath) { Write-Log "Belum ada file dipilih." "error"; return }
    if (-not (Test-Path $docxPath)) { Write-Log "File tidak ditemukan: $docxPath" "error"; return }
    if ([System.IO.Path]::GetExtension($docxPath).ToLower() -ne ".docx") { Write-Log "Bukan file .docx." "error"; return }

    $btnConvert.Enabled = $false
    $btnBrowse.Enabled = $false
    $txtLog.Clear()

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

<<<<<<< HEAD
    $kategori = $cmbKategori.Text.Trim()
=======
    $kategori = $txtKategori.Text.Trim()
>>>>>>> 9e4dc759205071e95dd37202977893e09b5df887
    $paket = $txtPaket.Text.Trim()
    if ($kategori) {
        Write-Log "[ npm run convert ] (kategori: $kategori)" "accent"
        $convertArgs = "/c npm run convert -- `"$docxPath`" `"$kategori`" `"$paket`" 2>&1"
    } else {
        Write-Log "[ npm run convert ] (tanpa kategori - mode lama)" "accent"
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
        Write-Log "Konversi berhasil! Buka index.html di browser." "ok"
<<<<<<< HEAD
        Load-Categories
=======
>>>>>>> 9e4dc759205071e95dd37202977893e09b5df887
    } else {
        Write-Log "Konversi gagal (exit $($convertProc.ExitCode))." "error"
    }

    $btnConvert.Enabled = $true
    $btnBrowse.Enabled = $true
})

# ══════════════════════════════════════════════════════════════════════
#  TAB 2 - HAPUS PAKET
# ══════════════════════════════════════════════════════════════════════

$lblDeleteHint = New-Object System.Windows.Forms.Label
<<<<<<< HEAD
$lblDeleteHint.Text = "Centang paket buat hapus. Pilih satu node lalu klik tombol ganti nama. Item kuning (folder hilang) sudah pasti aman dihapus."
=======
$lblDeleteHint.Text = "Centang paket yang mau dihapus. Item kuning (folder hilang) sudah pasti aman dihapus."
>>>>>>> 9e4dc759205071e95dd37202977893e09b5df887
$lblDeleteHint.Font = New-Object System.Drawing.Font("Segoe UI", 8.5)
$lblDeleteHint.ForeColor = $colMuted
$lblDeleteHint.Location = New-Object System.Drawing.Point(0, 0)
$lblDeleteHint.Size = New-Object System.Drawing.Size($panelWidth, 18)
$panelDelete.Controls.Add($lblDeleteHint)

$tree = New-Object System.Windows.Forms.TreeView
$tree.Location = New-Object System.Drawing.Point(0, 22)
<<<<<<< HEAD
$tree.Size = New-Object System.Drawing.Size($panelWidth, 196)
=======
$tree.Size = New-Object System.Drawing.Size($panelWidth, 232)
>>>>>>> 9e4dc759205071e95dd37202977893e09b5df887
$tree.CheckBoxes = $true
$tree.BackColor = $colPanelBg
$tree.ForeColor = [System.Drawing.Color]::White
$tree.BorderStyle = "FixedSingle"
$tree.Font = New-Object System.Drawing.Font("Segoe UI", 9.5)
$tree.HideSelection = $false
$tree.ItemHeight = 22
$tree.ShowNodeToolTips = $true
$panelDelete.Controls.Add($tree)

<<<<<<< HEAD
$btnRenameCategory = New-Object System.Windows.Forms.Button
$btnRenameCategory.Text = "Ganti Nama Kategori"
$btnRenameCategory.Location = New-Object System.Drawing.Point(0, 222)
$btnRenameCategory.Size = New-Object System.Drawing.Size(180, 32)
$btnRenameCategory.Font = New-Object System.Drawing.Font("Segoe UI", 8.5)
$btnRenameCategory.BackColor = $colBtnIdle
$btnRenameCategory.ForeColor = [System.Drawing.Color]::White
$btnRenameCategory.FlatStyle = "Flat"
$btnRenameCategory.FlatAppearance.BorderColor = $colBorder
$btnRenameCategory.Cursor = [System.Windows.Forms.Cursors]::Hand
$panelDelete.Controls.Add($btnRenameCategory)

$btnRenamePackage = New-Object System.Windows.Forms.Button
$btnRenamePackage.Text = "Ganti Nama Paket"
$btnRenamePackage.Location = New-Object System.Drawing.Point(188, 222)
$btnRenamePackage.Size = New-Object System.Drawing.Size(180, 32)
$btnRenamePackage.Font = New-Object System.Drawing.Font("Segoe UI", 8.5)
$btnRenamePackage.BackColor = $colBtnIdle
$btnRenamePackage.ForeColor = [System.Drawing.Color]::White
$btnRenamePackage.FlatStyle = "Flat"
$btnRenamePackage.FlatAppearance.BorderColor = $colBorder
$btnRenamePackage.Cursor = [System.Windows.Forms.Cursors]::Hand
$panelDelete.Controls.Add($btnRenamePackage)

=======
>>>>>>> 9e4dc759205071e95dd37202977893e09b5df887
$btnRefresh = New-Object System.Windows.Forms.Button
$btnRefresh.Text = "Muat Ulang"
$btnRefresh.Location = New-Object System.Drawing.Point(0, 260)
$btnRefresh.Size = New-Object System.Drawing.Size(130, 36)
$btnRefresh.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$btnRefresh.BackColor = $colBtnIdle
$btnRefresh.ForeColor = [System.Drawing.Color]::White
$btnRefresh.FlatStyle = "Flat"
$btnRefresh.FlatAppearance.BorderColor = $colBorder
$btnRefresh.Cursor = [System.Windows.Forms.Cursors]::Hand
$btnRefresh.Add_Click({ $txtLog.Clear(); Load-Tree })
$panelDelete.Controls.Add($btnRefresh)

$btnDelete = New-Object System.Windows.Forms.Button
$btnDelete.Text = "Hapus Terpilih"
$btnDelete.Location = New-Object System.Drawing.Point(($panelWidth - 220), 260)
$btnDelete.Size = New-Object System.Drawing.Size(220, 36)
$btnDelete.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$btnDelete.BackColor = $colDanger
$btnDelete.ForeColor = [System.Drawing.Color]::White
$btnDelete.FlatStyle = "Flat"
$btnDelete.FlatAppearance.BorderSize = 0
$btnDelete.Cursor = [System.Windows.Forms.Cursors]::Hand
$panelDelete.Controls.Add($btnDelete)

function Get-Packages {
    $jsonOut = & node $deleteScriptPath --json 2>$null
    if (-not $jsonOut) { return @() }
    try {
        $parsed = $jsonOut | ConvertFrom-Json
        if ($null -eq $parsed) { return @() }
        if ($parsed -isnot [System.Array]) { return @($parsed) }
        return $parsed
    } catch { return @() }
}

<<<<<<< HEAD
function Load-Categories {
    $packages = Get-Packages
    $cats = $packages | ForEach-Object { $_.category } | Where-Object { $_ } | Sort-Object -Unique
    $current = $cmbKategori.Text
    $cmbKategori.Items.Clear()
    foreach ($c in $cats) { $cmbKategori.Items.Add($c) | Out-Null }
    $cmbKategori.Text = $current
}

=======
>>>>>>> 9e4dc759205071e95dd37202977893e09b5df887
$script:suppressCheckEvent = $false

function Load-Tree {
    $tree.Nodes.Clear()
    $packages = Get-Packages
    if ($packages.Count -eq 0) {
        $emptyNode = New-Object System.Windows.Forms.TreeNode
        $emptyNode.Text = "Belum ada paket terdaftar di data/manifest.js."
        $emptyNode.Tag = "info"
        $tree.Nodes.Add($emptyNode) | Out-Null
        return
    }

    $byCategory = [ordered]@{}
    foreach ($p in $packages) {
        if (-not $byCategory.Contains($p.category)) { $byCategory[$p.category] = @() }
        $byCategory[$p.category] += $p
    }

    foreach ($cat in $byCategory.Keys) {
        $catNode = New-Object System.Windows.Forms.TreeNode
        $catNode.Text = "$cat  ($($byCategory[$cat].Count) paket)"
<<<<<<< HEAD
        $catNode.Name = $cat
=======
>>>>>>> 9e4dc759205071e95dd37202977893e09b5df887
        $catNode.Tag = "category"
        foreach ($p in $byCategory[$cat]) {
            $dataFolder = Join-Path $projectRoot "data\packages\$($p.id)"
            $isGhost = -not (Test-Path $dataFolder)
            $leaf = New-Object System.Windows.Forms.TreeNode
            $ghostTag = if ($isGhost) { "   ($([char]0x26A0) folder hilang)" } else { "" }
            $leaf.Text = "$($p.title) - $($p.count) soal$ghostTag"
<<<<<<< HEAD
            $leaf.Name = $p.title
=======
>>>>>>> 9e4dc759205071e95dd37202977893e09b5df887
            $leaf.Tag = $p.id
            $leaf.ToolTipText = "id: $($p.id)`nsumber: $($p.source)"
            if ($isGhost) { $leaf.ForeColor = $colGhost }
            $catNode.Nodes.Add($leaf) | Out-Null
        }
        $tree.Nodes.Add($catNode) | Out-Null
    }
    $tree.ExpandAll()
}

$tree.add_AfterCheck({
    param($src, $e)
    if ($script:suppressCheckEvent) { return }
    if ($e.Node.Tag -eq "info") { $e.Node.Checked = $false; return }
    $script:suppressCheckEvent = $true
    if ($e.Node.Tag -eq "category") {
        foreach ($child in $e.Node.Nodes) { $child.Checked = $e.Node.Checked }
    } else {
        $parent = $e.Node.Parent
        if ($parent) {
            $allChecked = $true
            foreach ($child in $parent.Nodes) { if (-not $child.Checked) { $allChecked = $false } }
            $parent.Checked = $allChecked
        }
    }
    $script:suppressCheckEvent = $false
})

$btnDelete.Add_Click({
    $idsToDelete = @()
    $titlesToDelete = @()
    foreach ($catNode in $tree.Nodes) {
        foreach ($leaf in $catNode.Nodes) {
            if ($leaf.Checked -and $leaf.Tag -ne "info") {
                $idsToDelete += $leaf.Tag
                $titlesToDelete += "  - $($leaf.Text)"
            }
        }
    }

    if ($idsToDelete.Count -eq 0) { Write-Log "Belum ada paket yang dicentang." "error"; return }

    $confirmMsg = "Yakin mau hapus $($idsToDelete.Count) paket ini?`n`n" + ($titlesToDelete -join "`n") + "`n`nFolder data + gambar paket ini akan dihapus permanen."
    $confirm = [System.Windows.Forms.MessageBox]::Show(
        $confirmMsg, "Konfirmasi Hapus",
        [System.Windows.Forms.MessageBoxButtons]::YesNo,
        [System.Windows.Forms.MessageBoxIcon]::Warning
    )
    if ($confirm -ne "Yes") { return }

    $btnDelete.Enabled = $false
    $btnRefresh.Enabled = $false
    $txtLog.Clear()
    Write-Log "[ menghapus $($idsToDelete.Count) paket ]" "accent"

    $idsArg = $idsToDelete -join ","
    # Path project bisa ada spasi (mis. "MSI MODERN"), jadi tiap argumen yang
    # mungkin mengandung spasi WAJIB dibungkus tanda kutip sendiri-sendiri di
    # dalam satu string -ArgumentList. Array -ArgumentList TIDAK auto-quote.
    $deleteArgsStr = "`"$deleteScriptPath`" --delete `"$idsArg`""
    $proc = Start-Process -FilePath "node" `
        -ArgumentList $deleteArgsStr `
        -WorkingDirectory $projectRoot `
        -RedirectStandardOutput "$env:TEMP\soalin_delete.txt" `
        -RedirectStandardError  "$env:TEMP\soalin_delete_err.txt" `
        -NoNewWindow -Wait -PassThru

    $out = if (Test-Path "$env:TEMP\soalin_delete.txt") { Get-Content "$env:TEMP\soalin_delete.txt" -Raw } else { "" }
    $err = if (Test-Path "$env:TEMP\soalin_delete_err.txt") { Get-Content "$env:TEMP\soalin_delete_err.txt" -Raw } else { "" }
    if ($out.Trim()) { Write-Log $out.Trim() }
    if ($err.Trim()) { Write-Log $err.Trim() "error" }

    if ($proc.ExitCode -eq 0) {
        Write-Log "Selesai. Commit + push perubahan biar ilang juga dari deploy." "ok"
    } else {
        Write-Log "Gagal (exit $($proc.ExitCode))." "error"
    }

    Load-Tree
<<<<<<< HEAD
    Load-Categories
=======
>>>>>>> 9e4dc759205071e95dd37202977893e09b5df887
    $btnDelete.Enabled = $true
    $btnRefresh.Enabled = $true
})

<<<<<<< HEAD
function Invoke-ManageScript {
    param([string]$argsStr)
    $proc = Start-Process -FilePath "node" `
        -ArgumentList $argsStr `
        -WorkingDirectory $projectRoot `
        -RedirectStandardOutput "$env:TEMP\soalin_rename.txt" `
        -RedirectStandardError  "$env:TEMP\soalin_rename_err.txt" `
        -NoNewWindow -Wait -PassThru
    $out = if (Test-Path "$env:TEMP\soalin_rename.txt") { Get-Content "$env:TEMP\soalin_rename.txt" -Raw } else { "" }
    $err = if (Test-Path "$env:TEMP\soalin_rename_err.txt") { Get-Content "$env:TEMP\soalin_rename_err.txt" -Raw } else { "" }
    if ($out.Trim()) { Write-Log $out.Trim() }
    if ($err.Trim()) { Write-Log $err.Trim() "error" }
    if ($proc.ExitCode -eq 0) {
        Write-Log "Selesai. Commit + push perubahan biar ikut berubah di deploy." "ok"
    } else {
        Write-Log "Gagal (exit $($proc.ExitCode))." "error"
    }
}

$btnRenameCategory.Add_Click({
    $node = $tree.SelectedNode
    if (-not $node -or $node.Tag -eq "info") { Write-Log "Pilih dulu kategori atau paket di daftar." "error"; return }
    $catNode = if ($node.Tag -eq "category") { $node } else { $node.Parent }
    if (-not $catNode -or $catNode.Tag -ne "category") { Write-Log "Tidak bisa menentukan kategori dari pilihan." "error"; return }
    $oldCat = $catNode.Name

    $newCat = [Microsoft.VisualBasic.Interaction]::InputBox(
        "Nama kategori baru untuk `"$oldCat`":`n(berlaku buat semua paket di kategori ini)",
        "Ganti Nama Kategori", $oldCat)
    $newCat = $newCat.Trim()
    if (-not $newCat -or $newCat -eq $oldCat) { return }

    $txtLog.Clear()
    Write-Log "[ mengganti nama kategori `"$oldCat`" -> `"$newCat`" ]" "accent"
    Invoke-ManageScript "`"$deleteScriptPath`" --rename-category `"$oldCat`" `"$newCat`""
    Load-Tree
    Load-Categories
})

$btnRenamePackage.Add_Click({
    $node = $tree.SelectedNode
    if (-not $node -or $node.Tag -eq "category" -or $node.Tag -eq "info") {
        Write-Log "Pilih dulu satu paket (bukan kategori) di daftar." "error"; return
    }
    $id = $node.Tag
    $oldTitle = $node.Name

    $newTitle = [Microsoft.VisualBasic.Interaction]::InputBox(
        "Nama paket baru untuk `"$oldTitle`":",
        "Ganti Nama Paket", $oldTitle)
    $newTitle = $newTitle.Trim()
    if (-not $newTitle -or $newTitle -eq $oldTitle) { return }

    $txtLog.Clear()
    Write-Log "[ mengganti nama paket `"$oldTitle`" -> `"$newTitle`" ]" "accent"
    Invoke-ManageScript "`"$deleteScriptPath`" --rename-package `"$id`" `"$newTitle`""
    Load-Tree
})

=======
>>>>>>> 9e4dc759205071e95dd37202977893e09b5df887
# ── Buka di tab yang diminta ──────────────────────────────────────────────
Set-ActiveTab $StartTab

# ── Run ───────────────────────────────────────────────────────────────────
$form.Add_Shown({ $form.Activate() })
[System.Windows.Forms.Application]::Run($form)
