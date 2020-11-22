import { app, clipboard, shell, screen, dialog } from 'electron';
import log from 'electron-log';
import { extractFull } from 'node-7z';
import fse from 'fs-extra';
import { promisify } from 'util';
import { exec } from 'child_process';
import to from 'await-to-js';
import path from 'path';
import { addListener, sendMessage } from '../messageListener';
import EV from '../../../common/messageEvents';
import { mainWindow } from '../windows';
import { convertOSToJavaFormat } from '../../../common/utils';
import { MANIFESTS } from '../manifests';
import { DB_INSTANCE, TEMP_PATH, USERDATA_PATH } from '../config';
import { downloadFile } from '../helpers/downloader';
import { extractFace, get7zPath } from '../helpers';

addListener(EV.UPDATE_PROGRESS_BAR, async v => {
  mainWindow.setProgressBar(v);
});

addListener(EV.HIDE_MAIN_WINDOW, async () => {
  if (mainWindow) {
    mainWindow.hide();
  }
});

addListener(EV.MINMAX_MAIN_WINDOW, async () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

addListener(EV.MINIMIZE_MAIN_WINDOW, async () => {
  mainWindow.minimize();
});

addListener(EV.SHOW_MAIN_WINDOW, async () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
});

addListener(EV.QUIT_APP, async () => {
  mainWindow.close();
  mainWindow = null;
});

addListener(EV.IS_APP_IMAGE, async () => {
  return process.env.APPIMAGE;
});

addListener(EV.GET_APP_VERSION, async () => {
  return app.getVersion();
});

addListener(EV.IS_MAIN_WINDOW_MAXIMIZED, async () => {
  return !mainWindow.maximizable;
});

addListener(EV.OPEN_EXTERNAL, async url => {
  shell.openExternal(url);
});

addListener(EV.OPEN_FOLDER_DIALOG, async defaultPath => {
  return dialog.showOpenDialog({
    properties: ['openDirectory'],
    defaultPath: path.dirname(defaultPath)
  });
});

addListener(EV.OPEN_FILE_DIALOG, async filters => {
  return dialog.showOpenDialog({
    properties: ['openFile'],
    filters
  });
});

addListener(EV.OPEN_MAIN_WINDOW_DEVTOOLS, async () => {
  mainWindow.webContents.openDevTools({ mode: 'undocked' });
});

addListener(EV.RESTART_APP, async () => {
  log.log('Restarting app');
  app.relaunch();
  mainWindow.close();
});

addListener(EV.GET_ALL_DISPLAYS_BOUNDS, async () => {
  return screen.getAllDisplays().map(v => v.bounds);
});

addListener(EV.COPY_TEXT_TO_CLIPBOARD, async v => {
  clipboard.writeText(v);
});

addListener(EV.COPY_IMAGE_TO_CLIPBOARD, async v => {
  clipboard.writeImage(v);
});

addListener(EV.INSTALL_JAVA, async () => {
  const javaOs = convertOSToJavaFormat(process.platform);
  const javaMeta = MANIFESTS.java.find(v => v.os === javaOs);
  const {
    version_data: { openjdk_version: version },
    binary_link: url,
    release_name: releaseName
  } = javaMeta;
  const javaBaseFolder = path.join(USERDATA_PATH, 'java');
  await fse.remove(javaBaseFolder);
  const downloadLocation = path.join(TEMP_PATH, path.basename(url));

  await downloadFile(downloadLocation, url, p => {
    mainWindow.setProgressBar(parseInt(p, 10) / 100);
    sendMessage(EV.UPDATE_JAVA_DOWNLOAD_PROGRESS, parseInt(p, 10));
  });

  mainWindow.setProgressBar(-1);
  sendMessage(EV.UPDATE_JAVA_DOWNLOAD_PROGRESS, null);
  await new Promise(resolve => setTimeout(resolve, 500));

  const totalSteps = process.platform !== 'win32' ? 2 : 1;

  sendMessage(EV.UPDATE_JAVA_DOWNLOAD_STEP, `Extracting 1 / ${totalSteps}`);
  const firstExtraction = extractFull(downloadLocation, TEMP_PATH, {
    $bin: get7zPath(),
    $progress: true
  });
  await new Promise((resolve, reject) => {
    firstExtraction.on('progress', ({ percent }) => {
      mainWindow.setProgressBar(percent);
      sendMessage(EV.UPDATE_JAVA_DOWNLOAD_PROGRESS, percent);
    });
    firstExtraction.on('end', () => {
      resolve();
    });
    firstExtraction.on('error', err => {
      reject(err);
    });
  });

  await fse.remove(downloadLocation);

  // If NOT windows then tar.gz instead of zip, so we need to extract 2 times.
  if (process.platform !== 'win32') {
    mainWindow.setProgressBar(-1);
    sendMessage(EV.UPDATE_JAVA_DOWNLOAD_PROGRESS, null);
    await new Promise(resolve => setTimeout(resolve, 500));
    sendMessage(EV.UPDATE_JAVA_DOWNLOAD_STEP, `Extracting 2 / ${totalSteps}`);
    const tempTarName = path.join(
      TEMP_PATH,
      path.basename(url).replace('.tar.gz', '.tar')
    );
    const secondExtraction = extractFull(tempTarName, TEMP_PATH, {
      $bin: get7zPath(),
      $progress: true
    });
    await new Promise((resolve, reject) => {
      secondExtraction.on('progress', ({ percent }) => {
        mainWindow.setProgressBar(percent);
        sendMessage(EV.UPDATE_JAVA_DOWNLOAD_PROGRESS, percent);
      });
      secondExtraction.on('end', () => {
        resolve();
      });
      secondExtraction.on('error', err => {
        reject(err);
      });
    });
    await fse.remove(tempTarName);
  }

  const directoryToMove =
    process.platform === 'darwin'
      ? path.join(TEMP_PATH, `${releaseName}-jre`, 'Contents', 'Home')
      : path.join(TEMP_PATH, `${releaseName}-jre`);
  await fse.move(directoryToMove, path.join(javaBaseFolder, version));

  await fse.remove(path.join(TEMP_PATH, `${releaseName}-jre`));

  const ext = process.platform === 'win32' ? '.exe' : '';

  if (process.platform !== 'win32') {
    const execPath = path.join(javaBaseFolder, version, 'bin', `java${ext}`);

    await promisify(exec)(`chmod +x "${execPath}"`);
    await promisify(exec)(`chmod 755 "${execPath}"`);
  }

  sendMessage(EV.UPDATE_JAVA_DOWNLOAD_STEP, `Java is ready!`);
  sendMessage(EV.UPDATE_PROGRESS_BAR, -1);
  sendMessage(EV.UPDATE_JAVA_DOWNLOAD_PROGRESS, null);
  await new Promise(resolve => setTimeout(resolve, 2000));
});

addListener(EV.GET_PLAYER_FACE_SKIN, skin => {
  return extractFace(skin);
});

addListener(EV.USER_PREF.SET_CONCURRENT_DOWNLOADS, concurrency => {
  return DB_INSTANCE.put('concurrentDownloads', concurrency);
});

addListener(EV.USER_PREF.GET_CONCURRENT_DOWNLOADS, () => {
  return DB_INSTANCE.get('concurrentDownloads');
});

addListener(EV.USER_PREF.SET_SHOW_NEWS, showNews => {
  return DB_INSTANCE.put('showNews', showNews);
});

addListener(EV.USER_PREF.GET_SHOW_NEWS, () => {
  return DB_INSTANCE.get('showNews');
});

addListener(EV.SET_LAST_CHANGELOG_SHOWN, () => {
  return DB_INSTANCE.put('lastVersionShown', app.getVersion());
});

addListener(EV.GET_LAST_CHANGELOG_SHOWN, async () => {
  const [, lastVersion] = await to(DB_INSTANCE.get('lastVersionShown'));
  return lastVersion || null;
});
