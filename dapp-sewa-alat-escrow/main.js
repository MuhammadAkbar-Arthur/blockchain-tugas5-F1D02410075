import { ethers } from "ethers";
import { CONTRACT_ADDRESS, SEPOLIA_CHAIN_ID } from "./config.js";

// ABI minimum yang cocok dengan Bab13_SewaAlatEscrow.sol
const ABI = [
  "function pemilik() view returns (address)",
  "function jumlahAlat() view returns (uint256)",
  "function saldoEscrow() view returns (uint256)",
  "function daftarAlat(uint256) view returns (string namaAlat, uint256 biayaSewa, uint256 uangJaminan, address penyewaAktif, uint8 status)",
  "function tambahAlat(string namaAlat, uint256 biayaEther, uint256 jaminanEther)",
  "function sewaAlat(uint256 idAlat) payable",
  "function konfirmasiKembali(uint256 idAlat)",
];

const $ = (id) => document.getElementById(id);
const inform = (msg) => {
  $("status").textContent = msg;
};
let provider;
let signer;
let contract;

function periksaAlamat() {
  if (!ethers.isAddress(CONTRACT_ADDRESS)) {
    throw new Error(
      "Isi CONTRACT_ADDRESS yang valid pada config.js (hasil deploy ke Sepolia).",
    );
  }
}

async function periksaJaringan() {
  const jaringan = await provider.getNetwork();
  $("network").textContent = `${jaringan.name} (chainId ${jaringan.chainId})`;
  if (jaringan.chainId !== SEPOLIA_CHAIN_ID) {
    throw new Error(
      "MetaMask bukan pada Sepolia (chainId 11155111). Pindahkan jaringan lalu hubungkan ulang.",
    );
  }
}

async function hubungkan() {
  try {
    if (!window.ethereum)
      throw new Error(
        "MetaMask tidak ditemukan. Pasang ekstensi MetaMask di browser.",
      );
    periksaAlamat();
    provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    await periksaJaringan();
    signer = await provider.getSigner();
    contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
    $("account").textContent = await signer.getAddress();
    inform("Dompet terhubung. Memuat data smart contract...");
    await muatData();
  } catch (err) {
    inform(`Gagal menghubungkan: ${err.shortMessage || err.message}`);
  }
}

async function muatData() {
  try {
    if (!contract) throw new Error("Klik Hubungkan MetaMask terlebih dahulu.");
    await periksaJaringan();
    const [pemilik, jumlah, saldo] = await Promise.all([
      contract.pemilik(),
      contract.jumlahAlat(),
      contract.saldoEscrow(),
    ]);
    $("pemilik").textContent = pemilik;
    $("jumlahAlat").textContent = jumlah.toString();
    $("saldoEscrow").textContent =
      `${ethers.formatEther(saldo)} ETH (${saldo.toString()} wei)`;

    const tbody = $("daftarAlatBody");
    tbody.innerHTML = "";
    const total = Number(jumlah);
    if (total === 0) {
      tbody.innerHTML = `<tr><td colspan="6">Belum ada unit alat terdaftar.</td></tr>`;
    } else {
      for (let i = 0; i < total; i++) {
        const a = await contract.daftarAlat(BigInt(i));
        const statusTeks =
          Number(a.status) === 0
            ? `<span class="badge-ready">Tersedia (0)</span>`
            : `<span class="badge-busy">SedangDisewa (1)</span>`;
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${i}</td>
          <td>${a.namaAlat}</td>
          <td>${ethers.formatEther(a.biayaSewa)} ETH</td>
          <td>${ethers.formatEther(a.uangJaminan)} ETH</td>
          <td>${statusTeks}</td>
          <td>${a.penyewaAktif}</td>
        `;
        tbody.appendChild(tr);
      }
    }
    inform("Data berhasil dibaca dari Sepolia.");
  } catch (err) {
    inform(`Gagal membaca: ${err.shortMessage || err.message}`);
  }
}

async function tambahAlat(event) {
  event.preventDefault();
  const btn = $("addBtn");
  try {
    if (!contract) throw new Error("Hubungkan MetaMask terlebih dahulu.");
    const nama = $("namaAlat").value.trim();
    const biaya = Number($("biayaEther").value.trim());
    const jaminan = Number($("jaminanEther").value.trim());
    if (
      !nama ||
      !Number.isSafeInteger(biaya) ||
      biaya < 1 ||
      !Number.isSafeInteger(jaminan) ||
      jaminan < 1
    ) {
      throw new Error(
        "Masukkan nama alat serta tarif biaya dan jaminan minimal 1 ETH.",
      );
    }
    await periksaJaringan();
    btn.disabled = true;
    inform("Konfirmasi transaksi melalui MetaMask...");
    const tx = await contract.tambahAlat(nama, BigInt(biaya), BigInt(jaminan));
    inform(`Transaksi dikirim: ${tx.hash}. Menunggu konfirmasi blok...`);
    const receipt = await tx.wait();
    if (receipt.status !== 1) throw new Error("Transaksi tidak berhasil.");
    await muatData();
    inform(`Transaksi berhasil! Hash: ${tx.hash}`);
  } catch (err) {
    inform(`Transaksi gagal: ${err.shortMessage || err.message}`);
  } finally {
    btn.disabled = false;
  }
}

async function sewaAlat() {
  const btn = $("rentBtn");
  try {
    if (!contract) throw new Error("Hubungkan MetaMask terlebih dahulu.");
    const id = Number($("idAlatEscrow").value.trim());
    await periksaJaringan();
    const a = await contract.daftarAlat(BigInt(id));
    const totalWei = a.biayaSewa + a.uangJaminan;
    btn.disabled = true;
    inform("Konfirmasi transaksi sewa melalui MetaMask...");
    const tx = await contract.sewaAlat(BigInt(id), { value: totalWei });
    inform(`Transaksi dikirim: ${tx.hash}. Menunggu konfirmasi blok...`);
    const receipt = await tx.wait();
    if (receipt.status !== 1) throw new Error("Transaksi tidak berhasil.");
    await muatData();
    inform(`Transaksi berhasil! Hash: ${tx.hash}`);
  } catch (err) {
    inform(`Transaksi gagal: ${err.shortMessage || err.message}`);
  } finally {
    btn.disabled = false;
  }
}

async function konfirmasiKembali() {
  const btn = $("returnBtn");
  try {
    if (!contract) throw new Error("Hubungkan MetaMask terlebih dahulu.");
    const id = Number($("idAlatEscrow").value.trim());
    await periksaJaringan();
    btn.disabled = true;
    inform("Konfirmasi pengembalian alat melalui MetaMask...");
    const tx = await contract.konfirmasiKembali(BigInt(id));
    inform(`Transaksi dikirim: ${tx.hash}. Menunggu konfirmasi blok...`);
    const receipt = await tx.wait();
    if (receipt.status !== 1) throw new Error("Transaksi tidak berhasil.");
    await muatData();
    inform(`Transaksi berhasil! Hash: ${tx.hash}`);
  } catch (err) {
    inform(`Transaksi gagal: ${err.shortMessage || err.message}`);
  } finally {
    btn.disabled = false;
  }
}

$("connectBtn").addEventListener("click", hubungkan);
$("refreshBtn").addEventListener("click", muatData);
$("formTambah").addEventListener("submit", tambahAlat);
$("rentBtn").addEventListener("click", sewaAlat);
$("returnBtn").addEventListener("click", konfirmasiKembali);

if (window.ethereum?.on) {
  window.ethereum.on("accountsChanged", () => {
    contract = null;
    $("account").textContent = "Akun berubah — hubungkan ulang";
    inform("Akun berubah. Hubungkan kembali MetaMask.");
  });
  window.ethereum.on("chainChanged", () => {
    contract = null;
    $("network").textContent = "Jaringan berubah — hubungkan ulang";
    inform("Jaringan berubah. Hubungkan kembali MetaMask.");
  });
}
