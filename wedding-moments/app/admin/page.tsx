import type {Metadata} from "next";import {AdminDashboard} from "@/components/admin-dashboard";import {requireChatGPTUser} from "@/app/chatgpt-auth";
export const metadata:Metadata={title:"Quản trị",robots:{index:false,follow:false}};
export default async function AdminPage(){await requireChatGPTUser("/admin");return <AdminDashboard/>}
