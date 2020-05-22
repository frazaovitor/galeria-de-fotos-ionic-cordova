import { Injectable } from "@angular/core";

import { Platform } from "@ionic/angular";

import {
  Plugins,
  CameraResultType,
  Capacitor,
  FilesystemDirectory,
  CameraPhoto,
  CameraSource,
} from "@capacitor/core";

const { Camera, Filesystem, Storage } = Plugins;

@Injectable({
  providedIn: "root",
})
export class PhotoService {
  constructor(platform: Platform) {
    this.platform = platform;
  }

  public photos: Photo[] = [];

  private PHOTO_STORAGE = "photos";

  private platform: Platform;

  public async addNewToGallery() {
    // Tirar foto
    const capturedPhoto = await Camera.getPhoto({
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera,
      quality: 100,
    });

    // Salve a foto e adicione-a à coleção de fotos
    const savedImageFile: any = await this.savePicture(capturedPhoto);

    this.photos.unshift(savedImageFile);

    Storage.set({
      key: this.PHOTO_STORAGE,
      value: this.platform.is("hybrid")
        ? JSON.stringify(this.photos)
        : JSON.stringify(
            this.photos.map((p) => {
              // Não salve a representação base64 dos dados da foto,
              // já que ele já foi salvo no sistema de arquivos
              const photoCopy = { ...p };
              delete photoCopy.base64;
              return photoCopy;
            })
          ),
    });
  }
  // Salvar imagem em arquivo no dispositivo
  private async savePicture(cameraPhoto: CameraPhoto) {
    // Converta foto no formato base64, exigido pela API do sistema de arquivos para salvar
    const base64Data = await this.readAsBase64(cameraPhoto);

    // Escreva o arquivo no diretório de dados
    const fileName = new Date().getTime() + ".jpeg";
    const savedFile = await Filesystem.writeFile({
      path: fileName,
      data: base64Data,
      directory: FilesystemDirectory.Data,
    });

    if (this.platform.is("hybrid")) {
      // Exiba a nova imagem reescrevendo o caminho 'file://' para HTTP
      // Detailhes: https://ionicframework.com/docs/building/webview#file-protocol
      return {
        filepath: savedFile.uri,
        webviewPath: Capacitor.convertFileSrc(savedFile.uri),
      };
    } else {
      // Use o webPath para exibir a nova imagem em vez da base64, pois já
      // está carregado na memória
      return {
        filepath: fileName,
        webviewPath: cameraPhoto.webPath,
      };
    }
  }

  // Busque a foto, leia como um blob e converta para o formato base64

  private async readAsBase64(cameraPhoto: CameraPhoto) {
    // "hybrid" quando detectar uso do Cordova ou Capacitor
    if (this.platform.is("hybrid")) {
      // Leia o arquivo no formato base64
      const file = await Filesystem.readFile({
        path: cameraPhoto.path,
      });
      return file.data;
    } else {
      // Busque a foto, leia como um blob e converta para o formato base64
      const response = await fetch(cameraPhoto.webPath);
      const blob = await response.blob();
      return (await this.convertBlobToBase64(blob)) as string;
    }
  }
  convertBlobToBase64 = (blob: Blob) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        resolve(reader.result);
      };
      reader.readAsDataURL(blob);
    });

  public async loadSaved() {
    // Recuperar dados da matriz de fotos em cache
    const photos = await Storage.get({ key: this.PHOTO_STORAGE });
    this.photos = JSON.parse(photos.value) || [];

    // Maneira mais fácil de detectar ao executar na web:
    // "quando a plataforma NÃO for híbrida, faça isso"
    if (!this.platform.is("hybrid")) {
      // Exiba a foto lendo no formato base64
      for (const photo of this.photos) {
        // Leia os dados de cada foto salva no sistema de arquivos
        const readFile = await Filesystem.readFile({
          path: photo.filepath,
          directory: FilesystemDirectory.Data,
        });
        // Apenas plataforma da Web: salve a foto no campo base64
        photo.base64 = `data:image/jpeg;base64,${readFile.data}`;
      }
    }
  }
  public async deletePicture(photo: Photo, position: number) {
    // Remova esta foto da array de dados de referência Fotos
    this.photos.splice(position, 1);
 
    // Atualize o cache da array de fotos substituindo a array de fotos existente
    Storage.set({
      key: this.PHOTO_STORAGE,
      value: JSON.stringify(this.photos)
    });
 
    // Excluir arquivo de foto do sistema de arquivos
    const filename = photo.filepath.substr(photo.filepath.lastIndexOf('/') + 1);
 
    await Filesystem.deleteFile({
      path: filename,
      directory: FilesystemDirectory.Data
    });
  }

}

interface Photo {
  filepath: string;
  webviewPath: string;
  base64?: string;
}
