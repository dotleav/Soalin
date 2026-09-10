# delete.ps1
# GUI buat hapus paket soal -> centang paket yang mau dihapus -> otomatis
# hapus folder data/packages/<id> + images/packages/<id> + entry di
# data/manifest.js (lewat scripts/delete-package.js).

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
$scriptPath = Join-Path $projectRoot "scripts\delete-package.js"

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
$form.Text = "Soalin — Hapus Paket Soal"
$form.ClientSize = New-Object System.Drawing.Size(520, 520)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.BackColor = [System.Drawing.Color]::FromArgb(18, 18, 18)
$form.ForeColor = [System.Drawing.Color]::White

$lblTitle = New-Object System.Windows.Forms.Label
$lblTitle.Text = "Hapus Paket Soal"
$lblTitle.Font = New-Object System.Drawing.Font("Segoe UI", 14, [System.Drawing.FontStyle]::Bold)
$lblTitle.ForeColor = [System.Drawing.Color]::FromArgb(232, 168, 56)
$lblTitle.Location = New-Object System.Drawing.Point(20, 20)
$lblTitle.Size = New-Object System.Drawing.Size(480, 30)
$form.Controls.Add($lblTitle)

$lblSub = New-Object System.Windows.Forms.Label
$lblSub.Text = "Centang paket yang mau dihapus (folder + entry manifest ikut dibersihkan)."
$lblSub.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$lblSub.ForeColor = [System.Drawing.Color]::FromArgb(160, 160, 160)
$lblSub.Location = New-Object System.Drawing.Point(20, 52)
$lblSub.Size = New-Object System.Drawing.Size(480, 34)
$form.Controls.Add($lblSub)

# ── TreeView (kategori -> paket), dengan checkbox ─────────────────────────
$tree = New-Object System.Windows.Forms.TreeView
$tree.Location = New-Object System.Drawing.Point(20, 92)
$tree.Size = New-Object System.Drawing.Size(480, 300)
$tree.CheckBoxes = $true
$tree.BackColor = [System.Drawing.Color]::FromArgb(30, 30, 30)
$tree.ForeColor = [System.Drawing.Color]::White
$tree.BorderStyle = "FixedSingle"
$tree.Font = New-Object System.Drawing.Font("Segoe UI", 9.5)
$tree.HideSelection = $false
$form.Controls.Add($tree)

# ── Kotak log ──────────────────────────────────────────────────────────────
$txtLog = New-Object System.Windows.Forms.RichTextBox
$txtLog.Location = New-Object System.Drawing.Point(20, 404)
$txtLog.Size = New-Object System.Drawing.Size(480, 74)
$txtLog.Font = New-Object System.Drawing.Font("Consolas", 8.5)
$txtLog.BackColor = [System.Drawing.Color]::FromArgb(10, 10, 10)
$txtLog.ForeColor = [System.Drawing.Color]::FromArgb(200, 200, 200)
$txtLog.BorderStyle = "FixedSingle"
$txtLog.ReadOnly = $true
$txtLog.ScrollBars = "Vertical"
$form.Controls.Add($txtLog)

function Write-Log {
    param([string]$msg, [string]$color = "normal")
    $txtLog.SelectionStart = $txtLog.TextLength
    $txtLog.SelectionLength = 0
    switch ($color) {
        "ok"      { $txtLog.SelectionColor = [System.Drawing.Color]::FromArgb(134, 239, 172) }
        "error"   { $txtLog.SelectionColor = [System.Drawing.Color]::FromArgb(252, 165, 165) }
        "accent"  { $txtLog.SelectionColor = [System.Drawing.Color]::FromArgb(232, 168, 56)  }
        "ghost"   { $txtLog.SelectionColor = [System.Drawing.Color]::FromArgb(250, 204, 21)  }
        default   { $txtLog.SelectionColor = [System.Drawing.Color]::FromArgb(200, 200, 200) }
    }
    $txtLog.AppendText("$msg`n")
    $txtLog.ScrollToCaret()
    $form.Refresh()
}

# ── Ambil daftar paket dari manifest lewat delete-package.js --json ──────
function Get-Packages {
    $jsonOut = & node $scriptPath --json 2>$null
    if (-not $jsonOut) { return @() }
    try {
        $parsed = $jsonOut | ConvertFrom-Json
        if ($null -eq $parsed) { return @() }
        # Kalau cuma 1 paket, ConvertFrom-Json bisa balikin objek tunggal (bukan array)
        if ($parsed -isnot [System.Array]) { return @($parsed) }
        return $parsed
    } catch {
        return @()
    }
}

$script:suppressCheckEvent = $false

function Load-Tree {
    $tree.Nodes.Clear()
    $packages = Get-Packages
    if ($packages.Count -eq 0) {
        Write-Log "Belum ada paket terdaftar di data/manifest.js." "accent"
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
        $catNode.Tag = "category"
        foreach ($p in $byCategory[$cat]) {
            $dataFolder = Join-Path $projectRoot "data\packages\$($p.id)"
            $isGhost = -not (Test-Path $dataFolder)
            $leaf = New-Object System.Windows.Forms.TreeNode
            $ghostTag = if ($isGhost) { "  ⚠ HANTU (folder tidak ada)" } else { "" }
            $leaf.Text = "$($p.title) — $($p.count) soal$ghostTag"
            $leaf.Tag = $p.id
            if ($isGhost) { $leaf.ForeColor = [System.Drawing.Color]::FromArgb(250, 204, 21) }
            $catNode.Nodes.Add($leaf) | Out-Null
        }
        $tree.Nodes.Add($catNode) | Out-Null
    }
    $tree.ExpandAll()
}

# Centang kategori -> ikut centang semua anaknya (dan sebaliknya)
$tree.add_AfterCheck({
    param($src, $e)
    if ($script:suppressCheckEvent) { return }
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

Load-Tree

# ── Tombol Refresh ─────────────────────────────────────────────────────────
$btnRefresh = New-Object System.Windows.Forms.Button
$btnRefresh.Text = "Muat Ulang"
$btnRefresh.Location = New-Object System.Drawing.Point(20, 462)
$btnRefresh.Size = New-Object System.Drawing.Size(110, 32)
$btnRefresh.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$btnRefresh.BackColor = [System.Drawing.Color]::FromArgb(45, 45, 45)
$btnRefresh.ForeColor = [System.Drawing.Color]::White
$btnRefresh.FlatStyle = "Flat"
$btnRefresh.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(80, 80, 80)
$btnRefresh.Cursor = [System.Windows.Forms.Cursors]::Hand
$btnRefresh.Add_Click({ $txtLog.Clear(); Load-Tree })
$form.Controls.Add($btnRefresh)

# ── Tombol Hapus Terpilih ───────────────────────────────────────────────────
$btnDelete = New-Object System.Windows.Forms.Button
$btnDelete.Text = "🗑  Hapus Terpilih"
$btnDelete.Location = New-Object System.Drawing.Point(300, 460)
$btnDelete.Size = New-Object System.Drawing.Size(200, 36)
$btnDelete.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$btnDelete.BackColor = [System.Drawing.Color]::FromArgb(220, 80, 70)
$btnDelete.ForeColor = [System.Drawing.Color]::White
$btnDelete.FlatStyle = "Flat"
$btnDelete.FlatAppearance.BorderSize = 0
$btnDelete.Cursor = [System.Windows.Forms.Cursors]::Hand
$btnDelete.Add_Click({
    $idsToDelete = @()
    $titlesToDelete = @()
    foreach ($catNode in $tree.Nodes) {
        foreach ($leaf in $catNode.Nodes) {
            if ($leaf.Checked) {
                $idsToDelete += $leaf.Tag
                $titlesToDelete += "  - $($leaf.Text)"
            }
        }
    }

    if ($idsToDelete.Count -eq 0) {
        Write-Log "⚠  Belum ada paket yang dicentang." "error"
        return
    }

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
    $proc = Start-Process -FilePath "node" `
        -ArgumentList @($scriptPath, "--delete", $idsArg) `
        -WorkingDirectory $projectRoot `
        -RedirectStandardOutput "$env:TEMP\soalin_delete.txt" `
        -RedirectStandardError  "$env:TEMP\soalin_delete_err.txt" `
        -NoNewWindow -Wait -PassThru

    $out = if (Test-Path "$env:TEMP\soalin_delete.txt") { Get-Content "$env:TEMP\soalin_delete.txt" -Raw } else { "" }
    $err = if (Test-Path "$env:TEMP\soalin_delete_err.txt") { Get-Content "$env:TEMP\soalin_delete_err.txt" -Raw } else { "" }
    if ($out.Trim()) { Write-Log $out.Trim() }
    if ($err.Trim()) { Write-Log $err.Trim() "error" }

    if ($proc.ExitCode -eq 0) {
        Write-Log "`n✓  Selesai. Commit + push perubahan biar ilang juga dari deploy." "ok"
    } else {
        Write-Log "`n✗  Gagal (exit $($proc.ExitCode))." "error"
    }

    Load-Tree
    $btnDelete.Enabled = $true
    $btnRefresh.Enabled = $true
})
$form.Controls.Add($btnDelete)

# ── Run ───────────────────────────────────────────────────────────────────
$form.Add_Shown({ $form.Activate() })
[System.Windows.Forms.Application]::Run($form)
