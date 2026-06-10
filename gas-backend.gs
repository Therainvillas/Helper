// ============================================================
// VILLATASK — Google Apps Script Backend
// ============================================================
// 1. Buat Google Sheet, buat 2 sheet: "Tugas" & "Devices"
// 2. Ganti SPREADSHEET_ID di bawah dengan ID sheet Anda
// 3. Buka script.google.com → Proyek Baru → paste kode ini
// 4. Deploy → Web App → Execute as: Me | Anyone → Salin URL
// ============================================================

var SS_ID = "SPREADSHEET_ID";
var SH_TUGAS = "Tugas";
var SH_DEVICES = "Devices";
// Headers Tugas:
// id | title | description | location | priority | status |
// assignedTo | photos(JSON) | completionNote | createdAt | updatedAt | completedAt
// Headers Devices: token | helperName | createdAt

// ======================== DO GET ========================
function doGet(e) {
  var a = "getTasks";
  if (e && e.parameter && e.parameter.action) a = e.parameter.action;
  var s = SpreadsheetApp.openById(SS_ID).getSheetByName(SH_TUGAS);
  var rows = s.getDataRange().getValues();
  if (rows.length < 2) return out({ tasks: [] });
  var tasks = [];
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (!r[0]) continue;
    var photos = [];
    try { photos = JSON.parse(r[7] || "[]"); } catch(ex) { photos = []; }
    tasks.push({
      id: r[0], title: r[1], description: r[2] || "",
      location: r[3] || "", priority: r[4], status: r[5],
      assignedTo: r[6] || "", photos: photos,
      completionNote: r[8] || "", createdAt: r[9], updatedAt: r[10], completedAt: r[11] || null
    });
  }
  if (a === "getHistory") {
    var filtered = [];
    for (var j = 0; j < tasks.length; j++) { if (tasks[j].status === "selesai") filtered.push(tasks[j]); }
    return out({ tasks: filtered });
  } else {
    var filtered2 = [];
    for (var j2 = 0; j2 < tasks.length; j2++) { if (tasks[j2].status !== "selesai") filtered2.push(tasks[j2]); }
    return out({ tasks: filtered2 });
  }
}

// ======================== DO POST ========================
function doPost(e) {
  var d = JSON.parse(e.postData.contents);
  var s = SpreadsheetApp.openById(SS_ID).getSheetByName(SH_TUGAS);
  var dev = SpreadsheetApp.openById(SS_ID).getSheetByName(SH_DEVICES);
  var rows, now, t, i, dRows, tok;

  // CREATE TASK
  if (d.action === "createTask") {
    t = d.task;
    s.appendRow([t.id, t.title, t.description||"", t.location||"",
      t.priority, t.status||"belum", t.assignedTo||"",
      JSON.stringify(t.photos||[]), t.completionNote||"",
      t.createdAt, t.updatedAt, t.completedAt||""]);
    return out({ success: true });
  }

  // UPDATE STATUS
  if (d.action === "updateTask") {
    rows = s.getDataRange().getValues();
    now = new Date().toISOString();
    for (i=1; i<rows.length; i++) {
      if (rows[i][0] === d.id) {
        s.getRange(i+1, 6).setValue(d.status);
        s.getRange(i+1, 11).setValue(now);
        if (d.status === "selesai") s.getRange(i+1, 12).setValue(now);
        return out({ success: true });
      }
    }
    return out({ error: "not found" });
  }

  // UPDATE FULL TASK
  if (d.action === "updateTaskFull") {
    rows = s.getDataRange().getValues();
    for (i=1; i<rows.length; i++) {
      if (rows[i][0] === d.task.id) {
        t = d.task;
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
    rows = s.getDataRange().getValues();
    for (i=1; i<rows.length; i++) {
      if (rows[i][0] === d.id) { s.deleteRow(i+1); return out({ success: true }); }
    }
    return out({ error: "not found" });
  }

  // REGISTER FCM DEVICE
  if (d.action === "registerDevice") {
    dRows = dev.getDataRange().getValues();
    for (i=1; i<dRows.length; i++) {
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
    var title = "Tugas Baru: " + d.taskTitle;
    var body = "Prioritas: " + d.priority;
    dRows = dev.getDataRange().getValues();
    var tokens = [];
    for (i=1; i<dRows.length; i++) {
      if (dRows[i][1] && dRows[i][1].toLowerCase() === (d.helperName||"").toLowerCase()) {
        tokens.push(dRows[i][0]);
      }
    }
    if (tokens.length === 0) {
      for (i=1; i<dRows.length; i++) { if (dRows[i][0]) tokens.push(dRows[i][0]); }
    }
    for (var ti=0; ti<tokens.length; ti++) {
      tok = tokens[ti];
      try {
        var proj = PropertiesService.getScriptProperties().getProperty("FCM_PROJECT_ID");
        if (proj) {
          var fcmUrl = "https://fcm.googleapis.com/v1/projects/" + proj + "/messages:send";
          var fcmToken = getFCMToken();
          if (fcmToken) {
            UrlFetchApp.fetch(fcmUrl, {
              method: "POST", muteHttpExceptions: true,
              headers: { Authorization: "Bearer " + fcmToken, "Content-Type": "application/json" },
              payload: JSON.stringify({ message: { token: tok, notification: { title: title, body: body },
                data: d.data||{}, android: { priority: "high" } } })
            });
          }
        }
      } catch(e) {}
    }
    return out({ success: true });
  }

  return out({ error: "Unknown action" });
}

// ======================== FCM AUTH ========================
function getFCMToken() {
  var key = PropertiesService.getScriptProperties().getProperty("FCM_PRIVATE_KEY");
  var email = PropertiesService.getScriptProperties().getProperty("FCM_CLIENT_EMAIL");
  if (!key || !email) return null;
  var now = Math.floor(Date.now()/1000);
  var header = Utilities.base64Encode(Utilities.newBlob(JSON.stringify({alg:"RS256",typ:"JWT"})).getBytes());
  var payload = Utilities.base64Encode(Utilities.newBlob(JSON.stringify({
    iss: email, scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token", exp: now + 3600, iat: now
  })).getBytes());
  var jwt = header + "." + payload;
  var sig = Utilities.computeRsaSha256Signature(jwt, key);
  var sigEncoded = Utilities.base64Encode(sig);
  var res = UrlFetchApp.fetch("https://oauth2.googleapis.com/token", {
    method: "POST", muteHttpExceptions: true,
    payload: { grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt + "." + sigEncoded }
  });
  var json = JSON.parse(res.getContentText());
  return json.access_token;
}

// ======================== HELPERS ========================
function out(d) { return ContentService.createTextOutput(JSON.stringify(d)).setMimeType(ContentService.MimeType.JSON); }
