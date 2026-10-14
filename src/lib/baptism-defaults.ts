import type { CertSettings } from "@/app/actions/baptisms";

export const DEFAULT_CERT_SETTINGS: CertSettings = {
  template: "classic",
  signer1: "Officiating Minister", signer2: "Senior Pastor", signer1Name: "", signer2Name: "",
  heading: "Certificate of Baptism",
  statement: "was baptised in the name of the Father, and of the Son, and of the Holy Spirit.",
  scripture: "Therefore we were buried with him by baptism into death, that as Christ was raised from the dead, we too might walk in newness of life. Romans 6:4",
};
