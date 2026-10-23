function ConvertTo-RPilotDatabaseUrl {
    param([AllowEmptyString()][string]$Value)
    # Clipboard text may have an invisible BOM/zero-width boundary from a web UI.
    # Do not remove characters inside credentials or silently change a password.
    $boundary = [char[]]@([char]0xFEFF, [char]0x200B, [char]0x200E, [char]0x200F, [char]0x2060)
    $candidate = ([string]$Value).Trim().Trim($boundary).Trim()
    if (-not $candidate) {
        throw 'Aucune URL recue. Relancez avec -DatabaseFromClipboard, puis copiez la connexion dans Neon > Connect AVANT d appuyer sur Entree.'
    }
    if ($candidate -match '^\*+$') {
        throw 'La saisie recue contient seulement des asterisques, pas une URL. Utilisez -DatabaseFromClipboard pour lire la connexion copiee depuis Neon.'
    }
    # Recognize complete wrappers as text only. Never evaluate a pasted command.
    # Accept the dotenv, shell and PowerShell formats offered in connection guides.
    if ($candidate -match '^(?:(?:export\s+)?DATABASE_URL|\$env:DATABASE_URL)\s*=\s*(.+)$') {
        $candidate = $Matches[1].Trim()
    } elseif ($candidate -match '^psql\s+(.+)$') {
        $candidate = $Matches[1].Trim()
    }
    $quotes = @(@(39,39), @(34,34), @(0x2018,0x2019), @(0x201C,0x201D))
    foreach ($pair in $quotes) {
        if ($candidate.Length -ge 2 -and [int]$candidate[0] -eq $pair[0] -and [int]$candidate[$candidate.Length - 1] -eq $pair[1]) {
            $candidate = $candidate.Substring(1, $candidate.Length - 2).Trim().Trim($boundary).Trim()
            break
        }
    }
    if ($candidate -notmatch '^postgres(?:ql)?://') {
        throw 'Le texte recu ne commence pas par postgresql://. Copiez la chaine de connexion depuis Neon > Connect, puis utilisez -DatabaseFromClipboard. Aucun mot de passe ne doit etre envoye dans le chat.'
    }
    if ($candidate -match '[\s\x00-\x1f\x7f\u200B\u200E\u200F\u2060\uFEFF]') {
        throw 'La connexion contient un espace, un retour a la ligne ou un caractere invisible. Utilisez le bouton Copier de Neon > Connect pour copier la chaine complete, sans la retaper.'
    }
    $parsedDatabase = $null
    if (-not [Uri]::TryCreate($candidate, [UriKind]::Absolute, [ref]$parsedDatabase)) {
        throw 'La structure de la connexion PostgreSQL est invalide. Recopiez la valeur complete avec le bouton Copier de Neon > Connect ; ne reconstruisez pas l URL en remplacant manuellement le mot de passe.'
    }
    if ($parsedDatabase.Scheme -notin @('postgres', 'postgresql') -or -not $parsedDatabase.Host -or $parsedDatabase.AbsolutePath.Trim('/') -eq '') {
        throw 'Connexion PostgreSQL attendue : postgresql://utilisateur:mot-de-passe@hote/base?sslmode=require (valeur masquee).'
    }
    if ($parsedDatabase.IsLoopback -or $parsedDatabase.Host.Trim('[', ']') -in @('0.0.0.0', '::')) {
        throw 'Utilisez la base PostgreSQL hebergee de production, jamais localhost.'
    }
    return $candidate
}

function Read-RPilotProductionDatabase {
    param([switch]$FromClipboard)
    $entered = $null
    $plainValue = $null
    try {
        if ($FromClipboard) {
            Write-Host 'Copiez maintenant la connexion PostgreSQL depuis Neon > Connect. Elle sera lue localement sans etre affichee ni enregistree.'
            $confirmation = Read-Host 'Apres avoir copie l URL, revenez ici et appuyez sur Entree (ne collez rien)' -AsSecureString
            if ($confirmation -is [System.Security.SecureString]) { $confirmation.Dispose() }
            try { $plainValue = Get-Clipboard -Raw -ErrorAction Stop } catch { throw 'Lecture du presse-papiers impossible. Utilisez une console PowerShell locale ou la saisie masquee.' }
        } else {
            $entered = Read-Host 'URL PostgreSQL de production (saisie masquee)' -AsSecureString
            $plainValue = [System.Net.NetworkCredential]::new('', $entered).Password
        }
        $plainValue = ConvertTo-RPilotDatabaseUrl $plainValue
        return ConvertTo-SecureString -String $plainValue -AsPlainText -Force
    } finally {
        $plainValue = $null
        if ($entered) { $entered.Dispose() }
    }
}
