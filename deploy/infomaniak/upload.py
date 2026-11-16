from ftplib import FTP_TLS, error_perm
from pathlib import Path, PurePosixPath
import os
import ssl


def deploy(ftp, source, destination):
    ftp.cwd(destination)
    root = ftp.pwd()
    files = sorted(
        (path for path in source.rglob("*") if path.is_file()),
        key=lambda path: (path.name in {"index.html", "sw.js"}, path.name == "sw.js", path),
    )
    if not {"index.html", "sw.js", "market.php", ".htaccess"} <= {
        str(path.relative_to(source)) for path in files
    }:
        raise ValueError("Le dossier dist ne contient pas tous les fichiers attendus.")

    for path in files:
        relative = path.relative_to(source)
        ftp.cwd(root)
        for directory in relative.parts[:-1]:
            try:
                ftp.cwd(directory)
            except error_perm as error:
                if not str(error).startswith("550 "):
                    raise
                ftp.mkd(directory)
                ftp.cwd(directory)
        temporary = relative.name + ".intrawallet-upload"
        with path.open("rb") as stream:
            ftp.storbinary("STOR " + temporary, stream)
        ftp.rename(temporary, relative.name)
        print("Publié : " + relative.as_posix(), flush=True)


def main():
    host = os.environ["INFOMANIAK_HOST"]
    user = os.environ["INFOMANIAK_USER"]
    password = os.environ["INFOMANIAK_FTP_PASSWORD"]
    destination = os.environ["INFOMANIAK_WEB_ROOT"]
    if not all((host, user, password, destination)):
        raise ValueError("Renseigne l’hôte, l’utilisateur, le mot de passe et le dossier FTP.")
    if ".." in PurePosixPath(destination).parts or any(char in destination for char in "\r\n\\"):
        raise ValueError("Le chemin FTP du dossier de déploiement est invalide.")

    with FTP_TLS(context=ssl.create_default_context(), timeout=30) as ftp:
        ftp.connect(host, 21)
        ftp.login(user, password)
        ftp.prot_p()
        ftp.set_pasv(True)
        deploy(ftp, Path("dist"), destination)


if __name__ == "__main__":
    main()
