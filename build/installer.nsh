; Script NSIS personalizzato per PeppeZ Easy Converter
; Garantisce la chiusura automatica e sicura di eventuali versioni precedenti in esecuzione
; durante aggiornamenti o disinstallazioni, evitando il blocco "impossibile chiudere l'app".

!macro customCheckAppRunning
  ; Uccide forzatamente l'applicazione e l'albero dei suoi processi per liberare file e risorse
  nsExec::Exec 'taskkill /f /t /im "${APP_EXECUTABLE_FILENAME}"'
  nsExec::Exec 'taskkill /f /t /im "PeppeZ Convert.exe"'
  Sleep 1200
!macroend

!macro customInit
  ; Prima di procedere con l'installazione o aggiornamento, assicura che nessuna istanza sia attiva
  nsExec::Exec 'taskkill /f /t /im "${APP_EXECUTABLE_FILENAME}"'
  nsExec::Exec 'taskkill /f /t /im "PeppeZ Convert.exe"'
  nsExec::Exec 'taskkill /f /im "filee-cli.exe"'
  nsExec::Exec 'taskkill /f /im "Filee.exe"'
  Sleep 1000
!macroend

!macro customUnInit
  ; Prima della disinstallazione, chiudi l'istanza se attiva
  nsExec::Exec 'taskkill /f /t /im "${APP_EXECUTABLE_FILENAME}"'
  nsExec::Exec 'taskkill /f /t /im "PeppeZ Convert.exe"'
  Sleep 1000
!macroend

!macro customUnInstallCheck
  ; Non bloccare e non mostrare mai popup di errore se il vecchio uninstaller fallisce o lascia file temporanei
  DetailPrint "Continuo con l'installazione sovrascrivendo i componenti..."
!macroend

