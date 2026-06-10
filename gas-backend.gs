// ============================================================
// VILLATASK — Google Apps Script Backend
// ============================================================
// 1. Buat Google Sheet, buat 2 sheet: "Tugas" & "Devices"
// 2. Ganti SPREADSHEET_ID di bawah dengan ID sheet Anda
// 3. Buka script.google.com → Proyek Baru → paste kode ini
// 4. Deploy → Web App → Execute as: Me | Anyone → Salin URL
// ============================================================

const SS_ID = "SPREADSHEET_ID";
const SH_TUGAS = "Tugas";
const SH_DEVICES = "Devices";
// Headers Tugas:
// id | title | description | location | priority | status |
// assignedTo | photos(JSON) | completionNote | createdAt | updatedAt | completedAt
// Headers Devices: token | helperName | createdAt

// ======================== DO GET ========================
function doGet(e) {
  const a = e?.parameter?.action || "getTasks";
  const s = SpreadsheetApp.openById(SS_ID).getSheetByName(SH_TUGAS);
  const rows = s.getDataRange().getValues();
  if (rows.length < 2) return out({ tasks: [] });
  const tasks = rows.slice(1).filter(r => r[0]).map(r => ({
    id: r[0], title: r[1], description: r[2]||"",
    location: r[3]||"", priority: r[4], status: r[5],
    assignedTo: r[6]||"", photos: JSON.parse(r[7]||"[]"),
    completionNote: r[8]||"", createdAt: r[9], updatedAt: r[10], completedAt: r[11]||null
  }));
  return out({ tasks: a === "getHistory" ? tasks.filter(t => t.status === "selesai") : tasks.filter(t => t.status !== "selesai") });
}

// ======================== DO POST ========================
function doPost(e) {
  const d = JSON.parse(e.postData.contents);
  const s = SpreadsheetApp.openById(SS_ID).getSheetByName(SH_TUGAS);
  const dev = SpreadsheetApp.openById(SS_ID).getSheetByName(SH_DEVICES);

  // CREATE TASK
  if (d.action === "createTask") {
    const t = d.task;
    s.appendRow([t.id, t.title, t.description||"", t.location||"",
      t.priority, t.status||"belum", t.assignedTo||"",
      JSON.stringify(t.photos||[]), t.completionNote||"",
      t.createdAt, t.updatedAt, t.completedAt||""]);
    return out({ success: true });
  }

  // UPDATE STATUS
  if (d.action === "updateTask") {
    const rows = s.getDataRange().getValues();
    const now = new Date().toISOString();
    for (let i=1; i<rows.length; i++) {
      if (rows[i][0] === d.id) {
        s.getRange(i+1, 6).setValue(d.status); // status
        s.getRange(i+1, 11).setValue(now); // updatedAt
        if (d.status === "selesai") s.getRange(i+1, 12).setValue(now); // completedAt
        return out({ success: true });
      }
    }
    return out({ error: "not found" });
  }

  // UPDATE FULL TASK
  if (d.action === "updateTaskFull") {
    const rows = s.getDataRange().getValues();
    for (let i=1; i<rows.length; i++) {
      if (rows[i][0] === d.task.id) {
        const t = d.task;
        s.getRange(i+1, 2).setValue(t.title);
        s.getRange(i+1, 3).setValue(t.description||"");
        s.getRange(i+1, 4).setValue(t.location||"");
        s.getRange(i+1, 5).setValue(t.priority);
        s.getRange(i+1, 6).setValue(t.status);
        s.getRange(i+1, 7).setValue(t.assignedTo||"");
        s.getRange(i+1, 8).setValue(JSON.stringify(t.photos||[]));
        s.getRange(i+1, 9).setValue(t.completionNote||"");
        s.getRange(i+1, 11).setValue(t.updatedAt);
        if(t.completedAt) s.getRange(i+1, 12).setValue(t.completedAt);
        return out({ success: true });
      }
    }
    return out({ error: "not found" });
  }

  // DELETE TASK
  if (d.action === "deleteTask") {
    const rows = s.getDataRange().getValues();
    for (let i=1; i<rows.length; i++) {
      if (rows[i][0] === d.id) { s.deleteRow(i+1); return out({ success: true }); }
    }
    return out({ error: "not found" });
  }

  // REGISTER FCM DEVICE
  if (d.action === "registerDevice") {
    const dRows = dev.getDataRange().getValues();
    for (let i=1; i<dRows.length; i++) {
      if (dRows[i][0] === d.token) {
        if (d.helperName) dev.getRange(i+1, 2).setValue(d.helperName);
        return out({ success: true, exists: true });
      }
    }
    dev.appendRow([d.token, d.helperName||"", new Date().toISOString()]);
    return out({ success: true });
  }

  // SEND PUSH NOTIFICATION + WHATSAPP
  if (d.action === "sendNotification") {
    const title = "Tugas Baru: " + d.taskTitle;
    const body = "Prioritas: " + d.priority;
    const dRows = dev.getDataRange().getValues();
    let tokens = [];
    for (let i=1; i<dRows.length; i++) {
      if (dRows[i][1] && dRows[i][1].toLowerCase() === (d.helperName||"").toLowerCase()) {
        tokens.push(dRows[i][0]);
      }
    }
    if (tokens.length === 0) {
      for (let i=1; i<dRows.length; i++) { if (dRows[i][0]) tokens.push(dRows[i][0]); }
    }
    tokens.forEach(tok => {
      try {
        const proj = PropertiesService.getScriptProperties().getProperty("FCM_PROJECT_ID");
        if (proj) UrlFetchApp.fetch("https://fcm.googleapis.com/v1/projects/"+proj+"/messages:send", {
          method: "POST", muteHttpExceptions: true,
          headers: { Authorization: "Bearer " + getFCMToken(), "Content-Type": "application/json" },
          payload: JSON.stringify({ message: { token: tok, notification: { title, body },
            data: d.data||{}, android: { priority: "high" } } })
        });
      } catch(e) {}
    });
    return out({ success: true });
  }

  return out({ error: "Unknown action" });
}

// ======================== FCM AUTH ========================
function getFCMToken() {
  const key = PropertiesService.getScriptProperties().getProperty("FCM_PRIVATE_KEY");
  const email = PropertiesService.getScriptProperties().getProperty("FCM_CLIENT_EMAIL");
  if (!key || !email) return null;
  const now = Math.floor(Date.now()/1000);
  const jwt = btoa(JSON.stringify({alg:"RS256",typ:"JWT"})) + "." +
             btoa(JSON.stringify({iss:email,scope:"https://www.googleapis.com/auth/firebase.messaging",
             aud:"https://oauth2.googleapis.com/token",exp:now+3600,iat:now}));
  const sig = Utilities.computeRsaSha256Signature(jwt, key);
  const res = UrlFetchApp.fetch("https://oauth2.googleapis.com/token", {
    method: "POST", muteHttpExceptions: true,
    payload: { grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt + "." + Utilities.base64Encode(sig) }
  });
  return JSON.parse(res.getContentText()).access_token;
}

// ======================== HELPERS ========================
function out(d) { return ContentService.createTextOutput(JSON.stringify(d)).setMimeType(ContentService.MimeType.JSON); }
