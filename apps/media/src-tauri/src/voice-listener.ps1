# WorshipHQ Live voice listener.
# Listens on the default microphone with the speech recognizer built into Windows and
# prints one JSON message per line:
#   {"type":"ready"}                       listening started
#   {"type":"level","level":0-100}         microphone level (about 4 times a second)
#   {"type":"partial","text":"..."}        words being heard right now
#   {"type":"heard","text":"...", "confidence":0.0-1.0, "kind":"reference"|"speech",
#    "book":0-65, "chapter":n, "verse":n, "verseEnd":n}
#   {"type":"error","message":"..."}       something stopped it (shown to the operator)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

function Send-Msg($obj) {
    [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress -Depth 4))
    [Console]::Out.Flush()
}

try {
    Add-Type -AssemblyName System.Speech
} catch {
    Send-Msg @{ type = 'error'; message = 'Speech recognition is not available on this computer.' }
    exit 1
}

$recInfo = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() |
    Where-Object { $_.Culture.TwoLetterISOLanguageName -eq 'en' } |
    Sort-Object { if ($_.Culture.Name -eq 'en-US') { 0 } else { 1 } } |
    Select-Object -First 1
if (-not $recInfo) {
    Send-Msg @{ type = 'error'; message = 'No English speech recognizer is installed. Open Windows Settings > Time & Language > Speech and add English.' }
    exit 2
}

$engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine($recInfo)
try {
    $engine.SetInputToDefaultAudioDevice()
} catch {
    Send-Msg @{ type = 'error'; message = 'No microphone found. Plug one in and set it as the default recording device in Windows Sound settings.' }
    exit 3
}

# ---------- numbers as spoken words ----------
$ones = @('', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen')
$tens = @('', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety')

function Get-Under100([int]$n) {
    if ($n -lt 20) { return $ones[$n] }
    $t = $tens[[math]::Floor($n / 10)]
    if ($n % 10 -eq 0) { return $t }
    return "$t $($ones[$n % 10])"
}

function Get-NumberWords([int]$n) {
    if ($n -lt 100) { return , @(Get-Under100 $n) }
    $rest = $n - 100
    if ($rest -eq 0) { return @('one hundred', 'a hundred') }
    $r = Get-Under100 $rest
    return @("one hundred $r", "one hundred and $r", "a hundred and $r")
}

# Plain number words (no attached values: large value grammars hit a limit in this API).
# The app turns "one hundred and nineteen" into 119 itself.
function New-NumberChoices([int]$max, [string]$key) {
    $choices = New-Object System.Speech.Recognition.Choices
    $words = New-Object System.Collections.Generic.List[string]
    for ($i = 1; $i -le $max; $i++) { foreach ($w in (Get-NumberWords $i)) { $words.Add($w) } }
    $choices.Add($words.ToArray())
    return $choices
}
# ---------- book names (index matches the app's book list) ----------
$books = @('Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua', 'Judges', 'Ruth',
    '1 Samuel', '2 Samuel', '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles', 'Ezra', 'Nehemiah',
    'Esther', 'Job', 'Psalms', 'Proverbs', 'Ecclesiastes', 'Song of Solomon', 'Isaiah', 'Jeremiah',
    'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum',
    'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi', 'Matthew', 'Mark', 'Luke', 'John', 'Acts',
    'Romans', '1 Corinthians', '2 Corinthians', 'Galatians', 'Ephesians', 'Philippians', 'Colossians',
    '1 Thessalonians', '2 Thessalonians', '1 Timothy', '2 Timothy', 'Titus', 'Philemon', 'Hebrews', 'James',
    '1 Peter', '2 Peter', '1 John', '2 John', '3 John', 'Jude', 'Revelation')

$numberNames = @{ '1' = @('first', 'one'); '2' = @('second', 'two'); '3' = @('third', 'three') }

$bookChoices = New-Object System.Speech.Recognition.Choices
for ($b = 0; $b -lt $books.Count; $b++) {
    $name = $books[$b]
    $spoken = New-Object System.Collections.Generic.List[string]
    if ($name -match '^([123]) (.+)$') {
        foreach ($prefix in $numberNames[$Matches[1]]) { $spoken.Add("$prefix $($Matches[2])") }
        $spoken.Add("the $($numberNames[$Matches[1]][0]) book of $($Matches[2])")
    } else {
        $spoken.Add($name)
        $spoken.Add("the book of $name")
    }
    if ($name -eq 'Psalms') { $spoken.Add('Psalm'); $spoken.Add('the Psalms') }
    if ($name -eq 'Song of Solomon') { $spoken.Add('Song of Songs'); $spoken.Add('Songs of Solomon') }
    if ($name -eq 'Revelation') { $spoken.Add('Revelations'); $spoken.Add('the book of Revelation') }
    if ($name -eq 'Philippians') { $spoken.Add('Philippian') }
    foreach ($s in $spoken) {
        $v = New-Object System.Speech.Recognition.SemanticResultValue($s, $b)
        $bookChoices.Add([System.Speech.Recognition.GrammarBuilder[]]@($v.ToGrammarBuilder()))
    }
}
$bookKey = New-Object System.Speech.Recognition.SemanticResultKey('book', [System.Speech.Recognition.GrammarBuilder[]]@($bookChoices.ToGrammarBuilder()))

# ---------- "John chapter three verse sixteen to eighteen" ----------
# (This speech API can't mark complex parts as optional, so each variant is spelled out.)
$GB = 'System.Speech.Recognition.GrammarBuilder'

function New-BookKey {
    New-Object System.Speech.Recognition.SemanticResultKey('book', [System.Speech.Recognition.GrammarBuilder[]]@($bookChoices.ToGrammarBuilder()))
}
function New-Words([string[]]$words) {
    $c = New-Object System.Speech.Recognition.Choices
    $c.Add($words)
    return $c.ToGrammarBuilder()
}

# tail: 0 = nothing, 1 = "16", 2 = "verse 16", 3 = "16 to 18", 4 = "verse 16 to 18"
function New-Reference([int]$tail, [string]$lead) {
    $g = New-Object $GB
    if ($lead -eq 'words') {
        $g.Append((New-Words @('turn to', 'turn with me to', 'open your bibles to', 'open to', 'read from', 'reading from', 'let us read', 'we read in', 'it says in')))
    } elseif ($lead -eq 'any') {
        $g.AppendWildcard()
    }
    $g.Append((New-BookKey).ToGrammarBuilder())
    $g.Append('chapter', 0, 1)
    $g.Append((New-NumberChoices 150 'chapter').ToGrammarBuilder())
    if ($tail -eq 2 -or $tail -eq 4) { $g.Append((New-Words @('verse', 'verses', 'and verse', 'from verse'))) }
    if ($tail -ge 1) { $g.Append((New-NumberChoices 176 'verse').ToGrammarBuilder()) }
    if ($tail -ge 3) {
        $g.Append((New-Words @('to', 'through', 'and', 'down to')))
        $g.Append((New-NumberChoices 176 'verseEnd').ToGrammarBuilder())
    }
    return $g
}

$variants = New-Object System.Collections.Generic.List[System.Speech.Recognition.GrammarBuilder]
foreach ($lead in @('none', 'words', 'any')) {
    foreach ($tail in 0..4) { $variants.Add((New-Reference $tail $lead)) }
}
$all = New-Object System.Speech.Recognition.Choices
$all.Add($variants.ToArray())
$refBuilder = $all.ToGrammarBuilder()
$refBuilder.Culture = $recInfo.Culture
$refGrammar = New-Object System.Speech.Recognition.Grammar($refBuilder)
$refGrammar.Name = 'reference'
$refGrammar.Priority = 10
$engine.LoadGrammar($refGrammar)

# Free speech, so the operator can see what is being said.
try {
    $dictation = New-Object System.Speech.Recognition.DictationGrammar
    $dictation.Name = 'speech'
    $dictation.Weight = 0.15
    $engine.LoadGrammar($dictation)
} catch { }

Register-ObjectEvent -InputObject $engine -EventName SpeechRecognized -SourceIdentifier 'whq.rec' | Out-Null
Register-ObjectEvent -InputObject $engine -EventName SpeechHypothesized -SourceIdentifier 'whq.hyp' | Out-Null

$engine.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)
Send-Msg @{ type = 'ready'; recognizer = $recInfo.Description }

function Get-Sem($sem, [string]$key) {
    if ($sem.ContainsKey($key)) { return [int]$sem[$key].Value }
    return $null
}

$lastLevel = -1
while ($true) {
    $evt = Wait-Event -Timeout 0.25
    while ($evt) {
        $result = $evt.SourceEventArgs.Result
        if ($evt.SourceIdentifier -eq 'whq.rec' -and $result) {
            $msg = @{ type = 'heard'; text = $result.Text; confidence = [math]::Round($result.Confidence, 2) }
            if ($result.Grammar -and $result.Grammar.Name -eq 'reference') {
                $msg.kind = 'reference'
                $msg.book = Get-Sem $result.Semantics 'book'
                $msg.chapter = Get-Sem $result.Semantics 'chapter'
                $v = Get-Sem $result.Semantics 'verse'
                if ($null -ne $v) { $msg.verse = $v }
                $ve = Get-Sem $result.Semantics 'verseEnd'
                if ($null -ne $ve) { $msg.verseEnd = $ve }
            } else {
                $msg.kind = 'speech'
            }
            Send-Msg $msg
        } elseif ($evt.SourceIdentifier -eq 'whq.hyp' -and $result) {
            Send-Msg @{ type = 'partial'; text = $result.Text }
        }
        Remove-Event -EventIdentifier $evt.EventIdentifier
        $evt = Get-Event | Select-Object -First 1
    }
    $level = $engine.AudioLevel
    if ($level -ne $lastLevel) {
        Send-Msg @{ type = 'level'; level = $level }
        $lastLevel = $level
    }
}
